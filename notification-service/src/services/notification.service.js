import { NotificationRepository } from "../repositories/notification.repository.js";
import axios from "axios";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://user-service:8001";
const INTERNAL_SECRET =
  process.env.INTERNAL_SECRET || "your-super-secret-key-for-internal-services";

export class NotificationService {
  static async createNotification(notificationData) {
    const { user_id, title_template, body_template, link_url } =
      notificationData;

    const createdNotification = await NotificationRepository.createNotification(
      user_id,
      title_template,
      body_template,
      link_url
    );
    return createdNotification;
  }

  static async createNotificationToMultipleUsers(notificationData) {
    const { user_ids, title_template, body_template, link_url } =
      notificationData;
    const createdNotifications =
      await NotificationRepository.createNotificationToMultipleUsers(
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

  static async getFollowersOfUser(userId) {
    try {
      const response = await axios.get(
        `${USER_SERVICE_URL}/users/relationships/followers`,
        {
          params: { userId },
        }
      );
      return response.data || [];
    } catch (error) {
      console.error(
        `Failed to get followers for user ${userId}:`,
        error.message
      );
      return [];
    }
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

  // Create or update aggregated notification (for likes, comments on same post)
  static async createAggregatedNotification({
    user_id,
    reference_id,
    title_template,
    body_template,
    link_url,
    last_actor_id,
    last_actor_name,
  }) {
    const { notification, isNew } =
      await NotificationRepository.upsertAggregatedNotification({
        user_id,
        reference_id,
        title_template,
        body_template,
        link_url,
        last_actor_id,
        last_actor_name,
      });

    // Emit realtime notification
    try {
      await axios.post(
        `${GATEWAY_URL}/internal/emit-notification`,
        {
          user_ids: [user_id],
          payload: {
            id: notification.id,
            title: notification.title_template,
            body: notification.body_template,
            link: notification.link_url,
            actors_count: notification.actors_count,
            last_actor_name: notification.last_actor_name,
            isNew,
            createdAt: notification.updated_at || notification.created_at,
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
      console.error(
        "Failed to emit realtime aggregated notification",
        err.message
      );
    }

    return notification;
  }
}
