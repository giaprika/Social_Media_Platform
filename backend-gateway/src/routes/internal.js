import express from "express";
import { emitNotificationToUsers } from "../socket/socketServer.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Middleware kiểm tra internal service token (tuỳ chọn bảo mật)
const verifyInternalRequest = (req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  if (secret !== process.env.INTERNAL_SECRET) {
    logger.warn("Unauthorized internal request", { ip: req.ip });
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

// Route để notification-service gọi emit realtime
router.post("/emit-notification", verifyInternalRequest, (req, res) => {
  try {
    const { user_ids, payload } = req.body;

    if (user_ids && Array.isArray(user_ids)) {
      const success = emitNotificationToUsers(user_ids, payload);
      return res.json({ success, count: user_ids.length });
    }

    return res.status(400).json({ error: "user_id or user_ids required" });
  } catch (error) {
    logger.error("Error emitting notification", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;