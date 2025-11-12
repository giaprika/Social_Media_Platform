import { v4 as uuidv4 } from "uuid";
import { NotificationRepository } from "../repositories/notification.repository.js";

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
