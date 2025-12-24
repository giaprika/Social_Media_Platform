import express from "express";
import axios from "axios";
import logger from "../../utils/logger.js";
import moderateContent from "../ai/aiService.js";

const router = express.Router();


export async function moderateLivestream(userId, base64Videos) {
  let parts = [];
  for (let i = 0; i < base64Videos.length; i++) {
    parts.push({
      inlineData: {
        displayName: `video_part_${i + 1}`,
        data: base64Videos[i],
        mimeType: "video/mp4",
      }

    });
  }
  // Gọi AI service để kiểm duyệt
  const newMessage = {
    role: "user",
    parts: parts
  };
  
  const aiResp = await moderateContent({
    userId: userId,
    newMessage: newMessage
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
    let moderationResult = { result: "Rejected", message: "Failed to parse AI response" };

    try {
      if (aiResponse.parts && aiResponse.parts.length > 0) {
        let textContent = aiResponse.parts[0].text;
        
        // Remove markdown code block wrapper
        textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Parse JSON
        const parsed = JSON.parse(textContent);
        
        moderationResult = {
          result: parsed.result.trim(),    // "Accepted", "Warning", or "Rejected" - TRIM whitespace
          message: parsed.message
        };
        
        logger.info("[PostService] AI Moderation parsed successfully", {
          result: moderationResult.result,
          resultLength: moderationResult.result.length,
          message: moderationResult.message
        });
      }
    } catch (parseError) {
      logger.error("[PostService] Failed to parse AI response", {
        error: parseError.message,
        response: aiResponse
      });
    }

    return moderationResult;
  }


/**
 * POST /api/livestream/moderation
 * Body: { base64Image: string }
 * Response: { ok: boolean, result: string, error?: string }
 */
router.post("/moderation", async (req, res) => {
  try {
    const {base64Videos } = req.body;
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

  return moderateLivestream(req.headers["x-user-id"], req.body.base64Videos)
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
