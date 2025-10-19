import { createProxyMiddleware } from "http-proxy-middleware";
import logger from "../utils/logger.js";
import config from "../config/index.js";

const createProxy = (serviceConfig) => {
  const {
    target,
    pathRewrite,
    timeout = 300000,
    retries = 3,
    onError,
  } = serviceConfig;

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    timeout,
    proxyTimeout: timeout,
    retries,

    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader("Accept", "application/json");
      proxyReq.setHeader("User-Agent", "API-Gateway/1.0");
      // Thêm correlation ID
      proxyReq.setHeader(
        "x-correlation-id",
        req.correlationId || Date.now().toString()
      );

      // Thêm thông tin user vào header nếu có
      if (req.user) {
        proxyReq.setHeader("x-user-id", req.user.id);
      }

      // Log request
      logger.info("Proxying request", {
        method: req.method,
        path: req.path,
        target,
        correlationId: req.correlationId,
        userId: req.user?.id,
      });
    },
    onProxyRes: (proxyRes, req, res) => {
      // Log response
      logger.info("Received response", {
        status: proxyRes.statusCode,
        path: req.path,
        correlationId: req.correlationId,
      });
    },
    onError: (err, req, res) => {
      logger.error("Proxy error", {
        error: err.message,
        path: req.path,
        correlationId: req.correlationId,
      });

      if (onError) {
        onError(err, req, res);
      } else {
        res.status(502).json({
          error: "Bad Gateway",
          message: "Service temporarily unavailable",
        });
      }
    },
  });
};

const createServiceProxy = (serviceName) => {
  const serviceConfig = config.services[serviceName];
  if (!serviceConfig) {
    throw new Error(`Service configuration not found for: ${serviceName}`);
  }

  return createProxy({
    target: serviceConfig.target,
    pathRewrite: serviceConfig.pathRewrite,
    timeout: serviceConfig.timeout,
    retries: serviceConfig.retries,
  });
};

export { createServiceProxy };
