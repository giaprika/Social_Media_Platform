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
      `${USER_SERVICE_URL}/api/relationships/followers/${userId}`
    );

    if (response.data && response.data.success) {
      // Extract follower IDs from response
      const followers = response.data.data || [];
      return followers.map((follower) => follower.follower_id || follower.id);
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
