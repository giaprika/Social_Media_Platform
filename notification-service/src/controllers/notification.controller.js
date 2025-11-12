import { NotificationService } from "../services/notification.service.js";
export class NotificationController {
  static async createNotification(req, res) {
    try {
      const notificationData = req.body;
      const createdNotification = await NotificationService.createNotification(
        notificationData
      );
      return res.status(201).json(createdNotification);
    } catch (error) {
      console.error("Error creating notification:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi tạo thông báo", error: error.message });
    }
  }

  static async createNotificationToMultipleUsers(req, res) {
    try {
      const notificationData = req.body;
      const createdNotifications = await NotificationService.createNotificationToMultipleUsers(
        notificationData
      );
      return res.status(201).json(createdNotifications);
    } catch (error) {
      console.error("Error creating notifications:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi tạo thông báo", error: error.message });
    }
  }

  static async getNotificationsByUserId(req, res) {
    try {
      const user_id = req.user.id; // Lấy user_id từ token đã giải mã
      const notifications = await NotificationService.findNotificationByUserId(
        user_id
      );
      return res.status(200).json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi lấy thông báo", error: error.message });
    }
  }
  static async markNotificationAsRead(req, res) {
    try {
      const { notification_id } = req.params;
      const updatedNotification = await NotificationService.markAsRead(
        notification_id
      );
      return res.status(200).json(updatedNotification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi đánh dấu thông báo đã đọc", error: error.message });
    }
  
  }

  static async deleteNotification(req, res) {
    try {
      const { notification_id } = req.params;
      await NotificationService.deleteNotification(notification_id);
      return res.status(200).json({ message: "Thông báo đã được xóa" });
    } catch (error) {
      console.error("Error deleting notification:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi xóa thông báo", error: error.message });
    }
  }
}
