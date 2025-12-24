import logger from "../../utils/logger.js";
import {
  feedServiceInstance,
  postServiceInstance,
} from "../../utils/axiosFactory.js";

class FeedService {
  /**
   * Lấy feed của user và enrich với thông tin chi tiết từ post-service
   */
  async getUserFeed(userId, page = 1, limit = 4) {
    try {
      logger.info(`[FeedService] Fetching feed for user ${userId}`, {
        page,
        limit,
      });

      // 1. Lấy feed items từ feed-service
      const feedResponse = await feedServiceInstance.get("/", {
        params: { userId, page, limit },
      });

      const feedItems = feedResponse.data?.data || [];

      if (feedItems.length === 0) {
        logger.info(`[FeedService] No feed items found for user ${userId}`);
        return {
          status: "success",
          message: "Feed retrieved successfully",
          data: [],
          _links: {
            self: { href: "/api/feed", method: "GET" },
          },
          metadata: {
            pagination: {
              limit,
              offset: (page - 1) * limit,
              total_items: 0,
            },
          },
        };
      }

      // 2. Extract post IDs từ feed items
      const postIds = feedItems.map((item) => item.post_id);
      logger.info(
        `[FeedService] Fetching ${postIds.length} posts from post-service`
      );

      // 3. Batch get posts từ post-service
      const postsResponse = await this.postServiceAxios.post("/posts/batch", {
        post_ids: postIds,
      });

      const posts = postsResponse.data?.data || [];

      // 4. Tạo map để lookup postpostServiceInstance theo score
      const postsMap = new Map();
      posts.forEach((post) => {
        postsMap.set(post.post_id, post);
      });

      // 5. Sắp xếp posts theo thứ tự của feed items (theo score)
      const orderedPosts = feedItems
        .map((feedItem) => postsMap.get(feedItem.post_id))
        .filter((post) => post !== undefined); // Lọc bỏ posts đã bị xóa

      logger.info(
        `[FeedService] Successfully retrieved ${orderedPosts.length} posts in feed order`
      );

      // 6. Mark feed items as viewed (fire-and-forget, chạy background)
      const feedItemIds = feedItems.map((item) => item.id);
      // Không await - chạy async background, không block response
      this.markAsViewed(feedItemIds).catch((error) => {
        logger.error("[FeedService] Failed to mark items as viewed", {
          userId,
          error: error.message,
        });
      });

      // 7. Trả về đúng format như PostListResponse
      return {
        status: "success",
        message: `Retrieved ${orderedPosts.length} posts`,
        data: orderedPosts,
        _links: {
          self: { href: "/api/feed", method: "GET" },
        },
        metadata: {
          pagination: {
            limit,
            offset: (page - 1) * limit,
            total_items: orderedPosts.length,
          },
        },
      };
    } catch (error) {
      logger.error("[FeedService] Error fetching user feed", {
        userId,
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Mark feed items as viewed (internal helper)
   */
  async markAsViewed(feedItemIds) {
    if (!feedItemIds || feedItemIds.length === 0) return;

    try {
      await feedServiceInstance.post("/view", { feedItemIds });
      logger.info(`[FeedService] Marked ${feedItemIds.length} items as viewed`);
    } catch (error) {
      logger.error("[FeedService] Error marking items as viewed", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await feedServiceInstance.get("/health");
      return response.data;
    } catch (error) {
      logger.error("[FeedService] Health check failed", {
        error: error.message,
      });
      throw error;
    }
  }
}

export default new FeedService();
