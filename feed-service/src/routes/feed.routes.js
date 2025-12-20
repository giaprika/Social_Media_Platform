const express = require("express");
const feedController = require("../controllers/feed.controller");

const router = express.Router();

// Get user feed
router.get("/", feedController.getFeed.bind(feedController));

// Mark feed items as viewed
router.post("/view", feedController.markAsViewed.bind(feedController));

// Manual cleanup trigger (admin)
router.post("/cleanup", feedController.triggerCleanup.bind(feedController));

// Health check
router.get("/health", feedController.healthCheck.bind(feedController));

module.exports = router;
