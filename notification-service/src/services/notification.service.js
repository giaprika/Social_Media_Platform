import { NotificationRepository } from "../repositories/notification.repository.js";
import axios from "axios";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "your-super-secret-key-for-internal-services";


export class NotificationService {
  static async createNotification(notificationData) {
    const {
      user_id,
      title_template,
      body_template,
      link_url
    } = notificationData;
  
    const createdNotification = await NotificationRepository.createNotification(
      user_id,
      title_template,
      body_template,
      link_url
    );
    return createdNotification;
  }

  static async createNotificationToMultipleUsers(notificationData) {
    const {
      user_ids,
      title_template,
      body_template,
      link_url
    } = notificationData; 
    const createdNotifications = await NotificationRepository.createNotificationToMultipleUsers(
      user_ids,
      title_template,
      body_template,
      link_url
    );

    // Emit realtime qua gateway
    try {
      await axios.post(
        `${GATEWAY_URL}/internal/emit-notification`,
        {
          user_ids,
          payload: {
            title: title_template,
            body: body_template,
            link: link_url,
            createdAt: new Date().toISOString(),
          },
        },
        {
          headers: {
            "x-internal-secret": INTERNAL_SECRET,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err) {
      // Log lỗi nhưng không fail toàn bộ request (realtime là optional)
      console.error("Failed to emit realtime notification", err.message);
    }


    return createdNotifications;
  }

  static async findNotificationByUserId(user_id) {
    return await NotificationRepository.findNotificationByUserId(user_id);
  }
  
  static async markAsRead(notification_id) {
    return await NotificationRepository.markAsRead(notification_id);
  }

  static async deleteNotification(notification_id) {
    return await NotificationRepository.deleteNotification(notification_id);
  }
}
