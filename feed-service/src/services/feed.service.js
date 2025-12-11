const feedRepository = require("../repositories/feed.repository");
const logger = require("../utils/logger");
const { getUserFollowers } = require("./user.service");

class FeedService {
  /**
   * Fanout post to followers' feeds
   * Fetches followers from user-service if not provided
   */
  async fanoutPostToFollowers(postData) {
    try {
      let { postId, authorId, followerIds } = postData;

      // If followerIds not provided or empty, fetch from user-service
      if (!followerIds || followerIds.length === 0) {
        logger.info(`Fetching followers for user ${authorId}`);
        followerIds = await getUserFollowers(authorId);
      }

      if (!followerIds || followerIds.length === 0) {
        logger.info(`No followers to fanout for post ${postId}`);
        return { success: true, count: 0 };
      }

      const feedItems = await feedRepository.createFeedItems(
        followerIds,
        postId,
        authorId
      );

      logger.info(`Fanned out post ${postId} to ${feedItems.length} followers`);
      return { success: true, count: feedItems.length };
    } catch (error) {
      logger.error("Error in fanoutPostToFollowers:", error);
      throw error;
    }
  }

  /**
   * Update post score based on engagement
   */
  async updatePostScore(engagementData) {
    try {
      const { postId, likes, comments } = engagementData;

      const updatedItems = await feedRepository.updateScoreByPostId(
        postId,
        likes || 0,
        comments || 0
      );

      logger.info(
        `Updated score for post ${postId} (likes: ${likes}, comments: ${comments}), affected ${updatedItems.length} feed items`
      );
      return { success: true, count: updatedItems.length };
    } catch (error) {
      logger.error("Error in updatePostScore:", error);
      throw error;
    }
  }

  /**
   * Get user's personalized feed
   */
  async getUserFeed(userId, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      const feedItems = await feedRepository.getUserFeed(userId, limit, offset);

      return {
        success: true,
        data: feedItems,
        pagination: {
          page,
          limit,
          hasMore: feedItems.length === limit,
        },
      };
    } catch (error) {
      logger.error("Error in getUserFeed:", error);
      throw error;
    }
  }

  /**
   * Mark feed items as viewed by user
   */
  async markFeedItemsAsViewed(feedItemIds) {
    try {
      if (!Array.isArray(feedItemIds) || feedItemIds.length === 0) {
        return { success: true, count: 0 };
      }

      const updatedItems = await feedRepository.markAsViewed(feedItemIds);

      logger.info(`Marked ${updatedItems.length} feed items as viewed`);
      return { success: true, count: updatedItems.length };
    } catch (error) {
      logger.error("Error in markFeedItemsAsViewed:", error);
      throw error;
    }
  }

  /**
   * Clean up old viewed feed items
   */
  async cleanupOldFeedItems(daysThreshold = 10) {
    try {
      const deletedCount = await feedRepository.deleteOldViewedItems(
        daysThreshold
      );

      logger.info(`Cleanup completed: deleted ${deletedCount} old feed items`);
      return { success: true, deletedCount };
    } catch (error) {
      logger.error("Error in cleanupOldFeedItems:", error);
      throw error;
    }
  }
}

module.exports = new FeedService();
