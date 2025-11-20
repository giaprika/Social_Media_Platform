import express from "express";
import { NotificationController } from "../controllers/notification.controller.js";
import { authenticate } from "../middlewares/authMiddleware.js";
const router = express.Router();

// router.post("/notification", NotificationController.createNotification);
router.post("/", NotificationController.createNotificationToMultipleUsers);
router.get("/", authenticate, NotificationController.getNotificationsByUserId);
router.patch("/:notification_id/read", NotificationController.markNotificationAsRead);
router.delete("/:notification_id", NotificationController.deleteNotification);


export default router;
