import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { initSocketServer } from "./socket/socketServer.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 8000;

const httpServer = createServer(app);

// Khởi tạo Socket.IO
initSocketServer(httpServer);

httpServer.listen(PORT, () => {
  logger.info(`API Gateway listening on port ${PORT}`);
});