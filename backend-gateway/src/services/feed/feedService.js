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

      let orderedPosts;
      let isFallbackToPosts = false;

      if (feedItems.length === 0) {
        // Nếu feed rỗng hoàn toàn, lấy posts từ post-service
        logger.info(
          `[FeedService] No feed items found for user ${userId} on page ${page}, falling back to latest posts`
        );

        const postsResponse = await postServiceInstance.get("/posts", {
          params: {
            limit,
            offset: (page - 1) * limit,
          },
        });

        orderedPosts = postsResponse.data?.data || [];
        isFallbackToPosts = true;
      } else {
        // 2. Extract post IDs từ feed items
        const postIds = feedItems.map((item) => item.post_id);
        logger.info(
          `[FeedService] Fetching ${postIds.length} posts from post-service`
        );

        // 3. Batch get posts từ post-service
        const postsResponse = await postServiceInstance.post("/posts/batch", {
          post_ids: postIds,
        });

        const posts = postsResponse.data?.data || [];

        // 4. Tạo map để lookup posts theo score
        const postsMap = new Map();
        posts.forEach((post) => {
          postsMap.set(post.post_id, post);
        });

        // 5. Sắp xếp posts theo thứ tự của feed items (theo score)
        orderedPosts = feedItems
          .map((feedItem) => postsMap.get(feedItem.post_id))
          .filter((post) => post !== undefined); // Lọc bỏ posts đã bị xóa

        // 6. Nếu số posts từ feed < limit, bổ sung thêm posts từ post-service
        if (orderedPosts.length < limit) {
          logger.info(
            `[FeedService] Feed only has ${orderedPosts.length} posts, supplementing with latest posts`
          );

          const existingPostIds = new Set(orderedPosts.map((p) => p.post_id));
          const supplementCount = limit - orderedPosts.length;

          // Lấy thêm posts từ post-service (lấy nhiều hơn để có dự phòng sau khi filter)
          const supplementResponse = await postServiceInstance.get("/posts", {
            params: {
              limit: supplementCount * 2, // Lấy gấp đôi để đảm bảo đủ sau khi lọc trùng
              offset: 0, // Lấy từ đầu
            },
          });

          const supplementPosts = (supplementResponse.data?.data || [])
            .filter((post) => !existingPostIds.has(post.post_id)) // Loại bỏ posts đã có trong feed
            .slice(0, supplementCount); // Chỉ lấy đúng số lượng cần

          orderedPosts = [...orderedPosts, ...supplementPosts];

          if (supplementPosts.length > 0) {
            isFallbackToPosts = true; // Đánh dấu đã có posts bổ sung
            logger.info(
              `[FeedService] Added ${supplementPosts.length} supplement posts`
            );
          }
        }
      }

      logger.info(
        `[FeedService] Successfully retrieved ${orderedPosts.length} posts in feed order`
      );

      // 6. Mark feed items as viewed (fire-and-forget, chạy background)
      // Chỉ mark khi có feed items, không mark khi fallback sang posts
      if (!isFallbackToPosts && feedItems.length > 0) {
        const feedItemIds = feedItems.map((item) => item.id);
        // Không await - chạy async background, không block response
        this.markAsViewed(feedItemIds).catch((error) => {
          logger.error("[FeedService] Failed to mark items as viewed", {
            userId,
            error: error.message,
          });
        });
      }

      // 7. Trả về đúng format như PostListResponse
      // Note: total_items không thể xác định chính xác vì feed items có thể hết
      // hoặc posts có thể bị xóa. Frontend sẽ dựa vào số posts trả về để check hasMore
      return {
        status: "success",
        message: `Retrieved ${orderedPosts.length} posts${
          isFallbackToPosts ? " (from latest posts)" : ""
        }`,
        data: orderedPosts,
        _links: {
          self: { href: "/api/feed", method: "GET" },
        },
        metadata: {
          pagination: {
            limit,
            offset: (page - 1) * limit,
            current_page: page,
            returned_count: orderedPosts.length,
            is_fallback: isFallbackToPosts, // Flag cho frontend biết đã chuyển sang posts thông thường
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
