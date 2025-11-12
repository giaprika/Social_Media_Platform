import express from "express";
import { NotificationController } from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";
const router = express.Router();

// Routes không cần xác thực

// Routes cần xác thực (từ gateway)
// router.post("/notification", authenticate, NotificationController.createNotification);
router.post("/", authenticate, NotificationController.createNotificationToMultipleUsers);
router.get("/", authenticate, NotificationController.getNotificationsByUserId);
router.patch("/:notification_id/read", authenticate, NotificationController.markNotificationAsRead);
router.delete("/:notification_id", authenticate, NotificationController.deleteNotification);


export default router;
