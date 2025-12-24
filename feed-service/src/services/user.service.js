const axios = require("axios");
const logger = require("../utils/logger");

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:8001";
const POST_SERVICE_URL =
  process.env.POST_SERVICE_URL || "http://post-service:8003";

/**
 * Get followers of a user from user-service
 */
async function getUserFollowers(userId) {
  try {
    const response = await axios.get(
      `${USER_SERVICE_URL}/users/relationships/followers`,
      {
        params: { userId },
      }
    );
    console.log("response data:", response.data);

    if (response.data) {
      // Extract follower IDs from response
      const followers = response.data || [];
      return followers.map(
        (follower) => follower.user_id || follower.follower_info.id
      );
    }

    logger.warn(`No followers found for user ${userId}`);
    return [];
  } catch (error) {
    logger.error(
      `Failed to fetch followers for user ${userId}:`,
      error.message
    );
    return [];
  }
}

/**
 * Get recent posts from a user (max 10)
 */
async function getUserRecentPosts(userId, limit = 10) {
  try {
    const url = `${POST_SERVICE_URL}/api/v1/posts`;
    const response = await axios.get(url, {
      params: {
        user_id: userId,
        limit: limit,
        sort_by: "created_at",
        order: "desc",
      },
    });

    const posts = response.data?.data || [];
    logger.info(`Found ${posts.length} recent posts for user ${userId}`);
    return posts;
  } catch (error) {
    logger.error(`Error fetching posts for user ${userId}:`, error.message);
    return [];
  }
}

module.exports = {
  getUserFollowers,
  getUserRecentPosts,
};
