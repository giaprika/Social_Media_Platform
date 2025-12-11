require("dotenv").config();
const app = require("./app");
const { initializeDatabase } = require("./src/config/database");
const { connectRabbitMQ, closeRabbitMQ } = require("./src/config/rabbitmq");
const rabbitMQConsumer = require("./src/services/rabbitmq.consumer");
const cleanupJob = require("./src/jobs/cleanup.job");
const logger = require("./src/utils/logger");

const PORT = process.env.PORT || 3006;

let server;

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info("Database initialized");

    // Connect to RabbitMQ
    await connectRabbitMQ();
    logger.info("RabbitMQ connected");

    // Start consuming messages
    await rabbitMQConsumer.startConsuming();
    logger.info("RabbitMQ consumers started");

    // Start cleanup job
    cleanupJob.start();
    logger.info("Cleanup job started");

    // Start Express server
    server = app.listen(PORT, () => {
      logger.info(`Feed service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info("Shutting down gracefully...");

  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
    });
  }

  await closeRabbitMQ();

  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start the server
startServer();
