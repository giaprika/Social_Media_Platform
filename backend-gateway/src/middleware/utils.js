import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readdirSync, statSync } from "fs";
import config from "../config/index.js";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getExcludeList = async () => {
  const servicesDir = resolve(__dirname, "../services");
  let excludeList = [];

  try {
    // Đọc tất cả các thư mục con trong services
    const serviceDirs = readdirSync(servicesDir).filter((file) =>
      statSync(join(servicesDir, file)).isDirectory()
    );

    for (const serviceName of serviceDirs) {
      try {
        const servicePath = resolve(servicesDir, serviceName, "config.js");
        const serviceUrl = `file://${servicePath
          .replace(/\\/g, "/")
          .replace(/^([a-zA-Z]):/, (match, p1) => `/${p1.toLowerCase()}:`)}`;
        logger.info(`Loading config from: ${serviceUrl}`);

        const serviceModule = await import(serviceUrl);
        const serviceExcludeList = serviceModule.default.excludeList;
        excludeList = [
          ...excludeList,
          ...serviceExcludeList.map((p) => `/${serviceName}` + p),
        ];
      } catch (error) {
        logger.error(`Failed to load config for service: ${serviceName}`, {
          error: error.message,
          stack: error.stack,
        });
        continue;
      }
    }

    const availableServices = config.services;
    Object.entries(availableServices).forEach(([name, options]) => {
      const serviceExcludeList = options.excludeList;
      if (serviceExcludeList) {
        excludeList = [
          ...excludeList,
          ...serviceExcludeList.map((p) => `/service/${name}` + p),
        ];
      }
    });
  } catch (error) {
    logger.error("Auth exclude list parsing error", {
      error: error.message,
      stack: error.stack,
    });
  }

  return excludeList;
};
