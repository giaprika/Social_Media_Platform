const feedService = require("../services/feed.service");
const logger = require("../utils/logger");

class FeedController {
  /**
   * Get user's feed
   * GET /api/feed?page=1&limit=4
   */
  async getFeed(req, res) {
    try {
      const userId = req.user?.id || req.query.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 4;

      const result = await feedService.getUserFeed(userId, page, limit);

      res.json(result);
    } catch (error) {
      logger.error("Error in getFeed controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve feed",
        error: error.message,
      });
    }
  }

  /**
   * Mark feed items as viewed
   * POST /api/feed/view
   * Body: { feedItemIds: [1, 2, 3] }
   */
  async markAsViewed(req, res) {
    try {
      const { feedItemIds } = req.body;

      if (!Array.isArray(feedItemIds)) {
        return res.status(400).json({
          success: false,
          message: "feedItemIds must be an array",
        });
      }

      const result = await feedService.markFeedItemsAsViewed(feedItemIds);

      res.json(result);
    } catch (error) {
      logger.error("Error in markAsViewed controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark items as viewed",
        error: error.message,
      });
    }
  }

  /**
   * Manually trigger cleanup (admin only)
   * POST /api/feed/cleanup
   */
  async triggerCleanup(req, res) {
    try {
      const daysThreshold = parseInt(req.query.days) || 10;

      const result = await feedService.cleanupOldFeedItems(daysThreshold);

      res.json(result);
    } catch (error) {
      logger.error("Error in triggerCleanup controller:", error);
      res.status(500).json({
        success: false,
        message: "Failed to trigger cleanup",
        error: error.message,
      });
    }
  }

  /**
   * Health check
   * GET /api/feed/health
   */
  async healthCheck(req, res) {
    res.json({
      success: true,
      message: "Feed service is running",
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new FeedController();
