export default {
  enabled: true,
  baseURL: process.env.AI_SERVICE_URL || 'http://localhost:9000',
  timeout: parseInt(process.env.AI_SERVICE_TIMEOUT || '20000', 10),
  appName: process.env.APP_NAME || 'content_moderation_agent',
  // AI service không expose public endpoints, chỉ được gọi internally
  excludeList: []
};
