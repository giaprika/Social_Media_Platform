export default {
  // Endpoints không cần authenticate
  excludeList: [],

  // Feed Service URL
  feedServiceUrl: process.env.FEED_SERVICE_URL || "http://localhost:3006",

  // Timeout
  timeout: 10000, // 10 seconds
};
