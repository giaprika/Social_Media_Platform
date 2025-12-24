import axios from "axios";
import logger from "./logger.js";
import config from "../config/index.js";
import requestContext from "../middleware/context.js";
import { create } from "domain";
import { time } from "console";

// Tạo instance Axios với cấu hình chung
const createAxiosInstance = (options = {}) => {
  const {
    serviceName = "",
    baseURL = `http://localhost:${config.port}/api/service/${serviceName}`,
    timeout = 3000,
    headers = {},
  } = options;

  console.log(baseURL);

  const instance = axios.create({
    baseURL,
    timeout,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  // Request interceptor
  instance.interceptors.request.use(
    (config) => {
      const contextHeaders = requestContext.getHeaders();

      // Merge headers, với priority cho headers được truyền trực tiếp
      config.headers = {
        ...contextHeaders,
        ...config.headers,
      };

      // Thêm correlation ID nếu chưa có
      config.headers["x-correlation-id"] =
        config.headers["x-correlation-id"] || Date.now().toString();

      // Log request
      logger.info(`[${serviceName}] Making request`, {
        method: config.method?.toUpperCase(),
        url: config.url,
        correlationId: config.headers["x-correlation-id"],
      });

      return config;
    },
    (error) => {
      logger.error(`[${serviceName}] Request error`, {
        error: error.message,
        url: error.config?.url,
      });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  instance.interceptors.response.use(
    (response) => {
      logger.info(`[${serviceName}] Received response`, {
        status: response.status,
        url: response.config.url,
        correlationId: response.config.headers["x-correlation-id"],
      });

      return response;
    },
    (error) => {
      logger.error(`[${serviceName}] Response error`, {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message || error.data?.error,
        correlationId: error.config?.headers["x-correlation-id"],
      });

      // Xu ly lỗi tùy theo loại lỗi
      if (error.response) {
        return Promise.reject(error);
      } else if (error.request) {
        return Promise.reject({
          status: 503,
          message: `${serviceName} service unavailable`,
        });
      } else {
        return Promise.reject({
          status: 500,
          message: `${serviceName} internal error`,
        });
      }
    }
  );

  return instance;
};

const userServiceInstance = createAxiosInstance({
  baseURL:
    (config.userServiceUrl ||
      config.services.users.target ||
      "http://localhost:8001") + "/users",
  timeout: config.services.users.timeout,
  serviceName: "users",
});

const postServiceInstance = createAxiosInstance({
  baseURL:
    (config.postServiceUrl ||
      config.services.posts.target ||
      "http://localhost:8003") + "/api/v1",
  timeout: config.services.posts.timeout,
  serviceName: "posts",
});

const feedServiceInstance = createAxiosInstance({
  baseURL:
    (config.feedServiceUrl ||
      config.services.feed.target ||
      "http://localhost:3006") + "/api/feed",
  timeout: config.services.feed.timeout,
  serviceName: "feed",
});

const notificationInstance = createAxiosInstance({
  baseURL:
    (config.notificationServiceUrl ||
      config.services.notifications.target ||
      "http://localhost:8005") + "/notifications",
  timeout: config.services.notifications.timeout,
  serviceName: "notifications",
});

// Export factory function để tạo custom instances
export {
  createAxiosInstance,
  userServiceInstance,
  postServiceInstance,
  feedServiceInstance,
  notificationInstance,
};
