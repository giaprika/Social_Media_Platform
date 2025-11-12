import * as db from "../config/database.js";

export class NotificationRepository {
  static async findNotificationByUserId(user_id) {
    const result = await db.query(
      `SELECT id, user_id, title_template, body_template, is_readed, created_at 
       FROM notifications WHERE user_id = $1`,
      [user_id]
    );
    return result.rows;
  }


  static async createNotification(user_id, title_template, body_template, link_url) {
    const result = await db.query(
      `INSERT INTO notifications (id, user_id, title_template, body_template, link_url) 
       VALUES (gen_random_uuid(), $1, $2, $3, $4) 
       RETURNING id, user_id, title_template, body_template, is_readed, created_at, link_url`,
      [user_id, title_template, body_template, link_url]
    );
    return result.rows[0];
  }

  static async markAsRead(notification_id) {
    const result = await db.query(
      `UPDATE notifications 
       SET is_readed = true 
       WHERE id = $1 
       RETURNING id, user_id, title_template, body_template, is_readed, created_at, link_url`,
      [notification_id]
    );
    return result.rows[0];
  }

  static async deleteNotification(notification_id) {
    const result = await db.query(
      `DELETE FROM notifications 
       WHERE id = $1 
       RETURNING id`,
      [notification_id]
    );
    return result.rows[0];
  }

  static async createNotificationToMultipleUsers(user_ids, title_template, body_template, link_url) {
    const createdNotifications = [];
    for (const user_id of user_ids) {
      const result = await db.query(
        `INSERT INTO notifications (id, user_id, title_template, body_template, link_url) 
         VALUES (gen_random_uuid(), $1, $2, $3, $4) 
         RETURNING id, user_id, title_template, body_template, is_readed, created_at, link_url`,
        [user_id, title_template, body_template, link_url]
      );
      createdNotifications.push(result.rows[0]);
    }
    return createdNotifications;
  }
}
