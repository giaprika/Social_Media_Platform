import express from "express";
import FeedController from "./controller.js";

const router = express.Router();

// Health check
router.get("/health", FeedController.healthCheck);

// Get user feed (with post details enriched)
router.get("/", FeedController.getUserFeed);

export default router;
