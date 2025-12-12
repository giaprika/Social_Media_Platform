/**
 * AI Service không expose routes trực tiếp qua Gateway
 * Service này chỉ được dùng internally bởi các services khác (posts, comments)
 * 
 * Nếu cần test AI service trực tiếp, gọi ADK server: http://localhost:9000
 */

import express from "express";

const router = express.Router();

// Health check (chỉ để tránh lỗi khi gateway load)
router.get("/", (req, res) => {
  res.json({ 
    message: "AI Service is internal only. No direct endpoints exposed via Gateway.",
    note: "Use POST /api/posts or POST /api/posts/:id/comments to trigger AI moderation"
  });
});

export default router;
