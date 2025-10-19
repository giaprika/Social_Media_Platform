import express from "express";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readdirSync, statSync } from "fs";
import logger from "../utils/logger.js";
import { createServiceProxy } from "../core/proxyFactory.js";
import { authMiddleware, contextMiddleware } from "../middleware/auth.js";
import config from "../config/index.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const availableServices = Object.keys(config.services);

// Load service
const loadServiceRoutes = async () => {
  try {
    const loadedServices = [];

    for (const serviceName of availableServices) {
      try {
        router.use(
          `/api/service/${serviceName}`,
          authMiddleware,
          createServiceProxy(serviceName)
        );
        logger.info(`Loaded service routes for: ${serviceName}`);
        loadedServices.push(serviceName);
      } catch (error) {
        logger.error(`Failed to load service: ${serviceName}`, {
          error: error.message,
        });
      }
    }

    // Health check endpoint
    router.get("/health", (req, res) => {
      res.json({
        status: "ok",
        services: loadedServices,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (error) {
    logger.error("Failed to load services", { error: error.message });
    throw error;
  }
};

const loadCustomRoutes = async () => {
  const servicesDir = resolve(__dirname, "../services");

  try {
    // Đọc tất cả các thư mục con trong services
    const serviceDirs = readdirSync(servicesDir).filter((file) => {
      try {
        return statSync(join(servicesDir, file)).isDirectory();
      } catch (error) {
        logger.error(`Error checking directory: ${file}`, {
          error: error.message,
        });
        return false;
      }
    });

    for (const serviceName of serviceDirs) {
      try {
        const servicePath = resolve(servicesDir, serviceName, "index.js");
        const serviceUrl = `file://${servicePath.replace(/\\/g, "/")}`;
        logger.info(`Attempting to load custom service from: ${serviceUrl}`);
        const serviceModule = await import(serviceUrl);
        const serviceRouter = serviceModule.default;

        if (!serviceRouter) {
          throw new Error(`No default export found in ${serviceName} module`);
        }

        router.use(
          `/api/${serviceName}`,
          authMiddleware,
          contextMiddleware,
          serviceRouter
        );
        logger.info(
          `Successfully loaded custom service routes for: ${serviceName}`
        );
      } catch (error) {
        logger.error(`Failed to load custom service: ${serviceName}`, {
          error: error.message,
          stack: error.stack,
        });
      }
    }
  } catch (error) {
    logger.error("Failed to load custom services", {
      error: error.message,
      stack: error.stack,
    });
  }
};

await loadServiceRoutes();
await loadCustomRoutes();

export default router;
