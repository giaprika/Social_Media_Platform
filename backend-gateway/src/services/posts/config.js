export default {
  // Endpoints không cần authenticate
  excludeList: [],
  
  // AI Service configuration
  aiServiceUrl: process.env.AI_SERVICE_URL,
  
  // Timeout cho AI moderation (có thể lâu hơn do AI processing)
  aiTimeout: 30000, // 30 seconds
};
