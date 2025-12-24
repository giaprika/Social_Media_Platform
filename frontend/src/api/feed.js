import instance from "./axios";

// Feed API routes - gọi qua gateway
const FEED_BASE_URL = "/api/feed";

/**
 * Lấy personalized feed của user (sorted by intelligent score)
 * @param {Object} params - { page, limit }
 */
export const getUserFeed = (params = {}) => {
  const queryParams = new URLSearchParams();

  if (params.page) queryParams.append("page", params.page);
  if (params.limit) queryParams.append("limit", params.limit);

  const queryString = queryParams.toString();
  return instance.get(
    `${FEED_BASE_URL}${queryString ? `?${queryString}` : ""}`
  );
};
