const express = require("express");
const cors = require("cors");
const feedRoutes = require("./src//routes/feed.routes");
const logger = require("./src/utils/logger");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/feed", feedRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Feed Service",
    version: "1.0.0",
    status: "running",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

module.exports = app;
