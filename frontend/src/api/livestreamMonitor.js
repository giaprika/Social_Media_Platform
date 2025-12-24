import instance from "./axios";

/**
 * Start livestream monitoring
 * @param {string} streamId - The stream ID to monitor
 * @param {string} userId - The user ID of the streamer
 * @returns {Promise} - Response from the API
 */
export const startLivestreamMonitoring = async (streamId, userId) => {
  return instance.post("/api/livestream/start-monitoring", {
    streamId,
    userId,
  });
};
