const feedRepository = require("../repositories/feed.repository");
const logger = require("../utils/logger");
const { getUserFollowers, getUserRecentPosts } = require("./user.service");

class FeedService {
  /**
   * Fanout post to followers' feeds
   * Fetches followers from user-service if not provided
   */
  async fanoutPostToFollowers(postData) {
    try {
      let {
        postId,
        authorId,
        followerIds,
        likes = 0,
        comments = 0,
        postCreatedAt,
      } = postData;

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
        authorId,
        likes,
        comments,
        postCreatedAt
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
   * Add recent posts from an author to a follower's feed
   * Used when user follows someone - backfill with their recent posts
   */
  async addRecentPostsToFeed(followerId, authorId, limit = 10) {
    try {
      // Get recent posts from the author
      const posts = await getUserRecentPosts(authorId, limit);

      if (!posts || posts.length === 0) {
        logger.info(`No recent posts found for user ${authorId}`);
        return { success: true, count: 0 };
      }

      // Extract post IDs and create feed items with score calculation
      const feedItems = [];
      for (const post of posts) {
        // Handle both post_id and id field names
        const postId = post.post_id || post.id;
        const likes = post.reacts_count || post.likes || 0;
        const comments = post.comments_count || post.comments || 0;
        const postCreatedAt = post.created_at; // Use actual post creation time

        // Create feed item with initial score based on post age
        const item = await feedRepository.createFeedItemWithScore(
          followerId,
          postId,
          authorId,
          likes,
          comments,
          postCreatedAt
        );

        if (item) {
          feedItems.push(item);
        }
      }

      logger.info(
        `Added ${feedItems.length} recent posts from ${authorId} to ${followerId}'s feed`
      );
      return { success: true, count: feedItems.length };
    } catch (error) {
      logger.error("Error in addRecentPostsToFeed:", error);
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

  /**
   * Remove post from all feeds when post is deleted
   */
  async removePostFromFeeds(postId) {
    try {
      const deletedCount = await feedRepository.deleteFeedItemsByPostId(postId);

      logger.info(`Removed post ${postId} from ${deletedCount} feeds`);
      return { success: true, deletedCount };
    } catch (error) {
      logger.error("Error in removePostFromFeeds:", error);
      throw error;
    }
  }
}

module.exports = new FeedService();
