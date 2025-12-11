const axios = require("axios");
const logger = require("../utils/logger");

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:8001";

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

module.exports = {
  getUserFollowers,
};
