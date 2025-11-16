import dotenv from "dotenv";
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  env: "development",

  // Security
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || "*",

  // Service URLs
  userServiceUrl: process.env.USER_SERVICE_URL,

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // limit each IP to 100 requests per windowMs
  },

  // Logging
  logging: {
    level: "info",
    format: "json",
  },

  services: {
    users: {
      target: process.env.USER_SERVICE_URL,
      pathRewrite: {
        "^/api/service/users": "/users",
      },
      excludeList: [
        "/",
        "/login",
        "/register",
        "/deleteUser",
        "/saveRefreshToken",
      ],
      timeout: 5000,
    },
    notifications: {
      target: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:8002",
      pathRewrite: {
        "^/api/service/notifications": "/notifications",
      },
      excludeList: [],
      timeout: 5000,
    },
  },
};

// Validate required configuration
const requiredEnvVars = ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

export default config;
