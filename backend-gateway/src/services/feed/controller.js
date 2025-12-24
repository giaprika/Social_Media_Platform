import logger from "../../utils/logger.js";
import feedService from "./feedService.js";

class FeedController {
  /**
   * GET /api/feed - Lấy feed của user
   */
  static async getUserFeed(req, res) {
    try {
      const userId = req.headers["x-user-id"];

      if (!userId) {
        return res.status(401).json({
          status: "error",
          message: "User ID required",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 4;

      logger.info(`[FeedController] Getting feed for user ${userId}`, {
        page,
        limit,
        correlationId: req.correlationId,
      });

      const result = await feedService.getUserFeed(userId, page, limit);

      res.status(200).json(result);
    } catch (error) {
      logger.error("[FeedController] Error getting feed", {
        userId: req.headers["x-user-id"],
        error: error.message,
        response: error.response?.data,
        correlationId: req.correlationId,
      });

      res.status(error.response?.status || 500).json(
        error.response?.data || {
          status: "error",
          message: error.message,
        }
      );
    }
  }

  /**
   * GET /api/feed/health - Health check
   */
  static async healthCheck(req, res) {
    try {
      const result = await feedService.healthCheck();
      res.status(200).json(result);
    } catch (error) {
      logger.error("[FeedController] Health check failed", {
        error: error.message,
        correlationId: req.correlationId,
      });

      res.status(500).json({
        status: "error",
        message: "Feed service unavailable",
      });
    }
  }
}

export default FeedController;
