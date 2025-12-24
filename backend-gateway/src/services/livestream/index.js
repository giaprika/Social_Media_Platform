import express from "express";
import axios from "axios";
import logger from "../../utils/logger.js";
import moderateContent from "../ai/aiService.js";
import { notificationInstance } from "../../utils/axiosFactory.js";

const router = express.Router();

const CDN_BASE_URL = "https://cdn.extase.dev";

// Track active monitoring sessions to prevent duplicates
const activeMonitors = new Map(); // streamId -> intervalId

export async function moderateLivestream(userId, base64Videos) {
  let parts = [];
  for (let i = 0; i < base64Videos.length; i++) {
    parts.push({
      inlineData: {
        displayName: `video_part_${i + 1}`,
        data: base64Videos[i],
        mimeType: "video/mp4",
      },
    });
  }
  // Gọi AI service để kiểm duyệt
  const newMessage = {
    role: "user",
    parts: parts,
  };

  const aiResp = await moderateContent({
    userId: userId,
    newMessage: newMessage,
  });

  if (!aiResp.ok) {
    logger.error("[PostService] AI moderation failed", {
      error: aiResp.error,
      status: aiResp.status,
    });
    throw {
      status: aiResp.status || 500,
      message: "AI moderation service error",
      reason: aiResp.error,
    };
  }

  // Parse response from AI
  const aiResponse = aiResp.data;
  let moderationResult = {
    result: "Rejected",
    message: "Failed to parse AI response",
  };

  try {
    if (aiResponse.parts && aiResponse.parts.length > 0) {
      let textContent = aiResponse.parts[0].text;

      // Remove markdown code block wrapper
      textContent = textContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Parse JSON
      const parsed = JSON.parse(textContent);

      moderationResult = {
        result: parsed.result.trim(), // "Accepted", "Warning", or "Rejected" - TRIM whitespace
        message: parsed.message,
      };

      logger.info("[PostService] AI Moderation parsed successfully", {
        result: moderationResult.result,
        resultLength: moderationResult.result.length,
        message: moderationResult.message,
      });
    }
  } catch (parseError) {
    logger.error("[PostService] Failed to parse AI response", {
      error: parseError.message,
      response: aiResponse,
    });
  }

  return moderationResult;
}

/**
 * POST /api/livestream/start-monitoring
 * Body: { streamId: string, userId: string }
 * Response: { ok: boolean, message: string }
 */
router.post("/start-monitoring", async (req, res) => {
  const { streamId, userId } = req.body;

  if (!streamId || !userId) {
    return res.status(400).json({
      ok: false,
      error: "streamId and userId are required",
    });
  }

  // Check if monitoring already active for this stream
  if (activeMonitors.has(streamId)) {
    logger.warn("[LivestreamMonitor] Monitoring already active", {
      streamId,
      userId,
    });
    return res.json({
      ok: true,
      message: "Livestream monitoring already active",
    });
  }

  logger.info("[LivestreamMonitor] Starting monitoring", {
    streamId,
    userId,
    correlationId: req.correlationId,
  });

  // Start monitoring in background (don't block response)
  monitorLivestream(streamId, userId).catch((error) => {
    logger.error("[LivestreamMonitor] Monitoring error", {
      streamId,
      userId,
      error: error.message,
      stack: error.stack,
    });
    // Clean up on error
    activeMonitors.delete(streamId);
  });

  return res.json({
    ok: true,
    message: "Livestream monitoring started",
  });
});

/**
 * Monitor livestream by fetching segments and checking for violations
 */
async function monitorLivestream(streamId, userId) {
  const CHECK_INTERVAL = 10000; // Check every 10 seconds
  const OFFLINE_THRESHOLD = 4; // Consider offline after 3 consecutive failures
  let consecutiveFailures = 0;
  const checkedSegments = new Set(); // Track checked segments to avoid duplicates

  const intervalId = setInterval(async () => {
    try {
      logger.info("[LivestreamMonitor] Checking stream", {
        streamId,
        checkedCount: checkedSegments.size,
      });

      // Fetch and check stream segments
      const violation = await checkStreamSegments(
        streamId,
        userId,
        checkedSegments
      );
      // const violation = true;

      if (violation === null) {
        // No new segments found - stream might be offline
        consecutiveFailures++;
        logger.warn("[LivestreamMonitor] No new segments found", {
          streamId,
          consecutiveFailures,
        });

        if (consecutiveFailures >= OFFLINE_THRESHOLD) {
          logger.info(
            "[LivestreamMonitor] Stream appears offline, stopping monitoring",
            {
              streamId,
              consecutiveFailures,
            }
          );
          clearInterval(intervalId);
          activeMonitors.delete(streamId);
          return;
        }
      } else if (violation === false) {
        // Segment checked, no violation
        consecutiveFailures = 0;
      } else {
        // Violation detected
        logger.warn("[LivestreamMonitor] Violation detected", {
          streamId,
          userId,
          violation,
        });

        // Create violation notification
        await createViolationNotification(streamId, userId, violation.message);

        // Stop monitoring after violation
        clearInterval(intervalId);
        activeMonitors.delete(streamId);
        return;
      }
    } catch (error) {
      consecutiveFailures++;
      logger.error("[LivestreamMonitor] Check error", {
        streamId,
        error: error.message,
        consecutiveFailures,
      });

      // Stop if too many consecutive errors
      if (consecutiveFailures >= OFFLINE_THRESHOLD) {
        logger.error(
          "[LivestreamMonitor] Too many failures, stopping monitoring",
          {
            streamId,
            consecutiveFailures,
          }
        );
        clearInterval(intervalId);
        activeMonitors.delete(streamId);
      }
    }
  }, CHECK_INTERVAL);

  // Store the interval ID to prevent duplicates
  activeMonitors.set(streamId, intervalId);
}

/**
 * Fetch stream segments from CDN and check for violations
 * @returns {Object|null|false} - Violation object if found, null if no new segments, false if checked and no violation
 */
async function checkStreamSegments(streamId, userId, checkedSegments) {
  try {
    // Fetch HLS playlist
    const playlistUrl = `${CDN_BASE_URL}/live/${streamId}.m3u8`;
    logger.info("[LivestreamMonitor] Fetching playlist", { playlistUrl });

    const playlistResponse = await axios.get(playlistUrl, {
      timeout: 10000,
      validateStatus: (status) => status === 200,
    });

    const playlistContent = playlistResponse.data;

    // Parse m3u8 to get segment URLs
    const segmentLines = playlistContent
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"));

    if (segmentLines.length === 0) {
      logger.warn("[LivestreamMonitor] No segments found in playlist", {
        streamId,
      });
      return null;
    }

    // Get the latest segment (last one)
    const latestSegment = segmentLines[segmentLines.length - 1];

    // Skip if already checked this segment
    if (checkedSegments.has(latestSegment)) {
      logger.info(
        "[LivestreamMonitor] Segment already checked, waiting for new segment",
        {
          streamId,
          segment: latestSegment,
        }
      );
      return null;
    }

    const segmentUrl = latestSegment.startsWith("http")
      ? latestSegment
      : `${CDN_BASE_URL}/live/${latestSegment}`;

    logger.info("[LivestreamMonitor] Fetching new segment", { segmentUrl });

    // Download segment
    const segmentResponse = await axios.get(segmentUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    // Convert to base64
    const base64Video = Buffer.from(segmentResponse.data).toString("base64");

    logger.info("[LivestreamMonitor] Segment downloaded", {
      size: segmentResponse.data.byteLength,
      base64Length: base64Video.length,
    });

    // Mark this segment as checked
    checkedSegments.add(latestSegment);

    // Check content with AI
    const moderationResult = await moderateLivestream(userId, [base64Video]);

    logger.info("[LivestreamMonitor] Moderation result", {
      streamId,
      result: moderationResult.result,
      message: moderationResult.message,
    });

    // Return violation if rejected
    if (moderationResult.result === "Rejected") {
      return {
        message: moderationResult.message,
        timestamp: new Date().toISOString(),
      };
    }

    return false; // Checked successfully, no violation
  } catch (error) {
    // If playlist not found (404), stream is likely offline
    if (error.response?.status === 404) {
      logger.info("[LivestreamMonitor] Playlist not found - stream offline", {
        streamId,
      });
      return null;
    }

    logger.error("[LivestreamMonitor] Segment check error", {
      streamId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Create violation notification via notification-service
 */
async function createViolationNotification(streamId, userId, reason) {
  try {
    logger.info("[LivestreamMonitor] Creating violation notification", {
      streamId,
      userId,
      reason,
    });

    const notificationPayload = {
      user_ids: [userId],
      title_template: "Livestream Vi phạm",
      body_template: `Stream của bạn đã bị dừng do vi phạm nội dung: ${reason}`,
      link_url: `/live/${streamId}`,
      meta_data: JSON.stringify({
        type: "LIVESTREAM_VIOLATION",
        stream_id: streamId,
        reason: reason,
        timestamp: new Date().toISOString(),
      }),
    };

    const response = await notificationInstance.post("/", notificationPayload);

    logger.info("[LivestreamMonitor] Notification created", {
      streamId,
      userId,
      response: response.data,
    });

    return response.data;
  } catch (error) {
    logger.error("[LivestreamMonitor] Failed to create notification", {
      streamId,
      userId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * POST /api/livestream/moderation
 * Body: { base64Image: string }
 * Response: { ok: boolean, result: string, error?: string }
 */
router.post("/moderation", async (req, res) => {
  try {
    const { base64Videos } = req.body;
    if (!base64Videos) {
      return res.status(400).json({
        ok: false,
        error: "base64Videos is required",
      });
    }
    logger.info("Livestream moderation request received", {
      correlationId: req.correlationId,
      userId: req.headers["x-user-id"],
    });
  } catch (error) {
    logger.error("Livestream moderation error", {
      correlationId: req.correlationId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      error: error.message || "Internal server error",
      result: null,
    });
  }

  return moderateLivestream(req.headers["x-user-id"], req.body.base64Videos);
});

/**
 * GET /api/livestream_moderation/health
 * Response: { status: string }
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "livestream_moderation",
  });
});

export default router;

export const moderateContentLivestream = moderateLivestream;
