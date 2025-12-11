import * as db from "../config/database.js";

export class NotificationRepository {
  static async findNotificationByUserId(user_id) {
    const result = await db.query(
      `SELECT id, user_id, title_template, body_template, notification_type, reference_id, 
              actors_count, last_actor_id, last_actor_name, is_readed, link_url, created_at, updated_at
       FROM notifications 
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
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

  // Find existing aggregated notification for a specific post and type
  static async findAggregatedNotification(user_id, notification_type, reference_id) {
    const result = await db.query(
      `SELECT id, user_id, title_template, body_template, notification_type, reference_id, 
              actors_count, last_actor_id, last_actor_name, is_readed, created_at, updated_at, link_url
       FROM notifications 
       WHERE user_id = $1 AND notification_type = $2 AND reference_id = $3
       ORDER BY updated_at DESC
       LIMIT 1`,
      [user_id, notification_type, reference_id]
    );
    return result.rows[0] || null;
  }

  // Upsert aggregated notification: update if exists, create if not
  static async upsertAggregatedNotification({ user_id, notification_type, reference_id, title_template, body_template, link_url, last_actor_id, last_actor_name }) {
    // Try to find existing notification
    const existing = await this.findAggregatedNotification(user_id, notification_type, reference_id);

    if (existing) {
      // Update existing: increment count, update last actor, mark as unread
      const newCount = (existing.actors_count || 1) + 1;
      const result = await db.query(
        `UPDATE notifications 
         SET actors_count = $1, 
             last_actor_id = $2, 
             last_actor_name = $3, 
             body_template = $4, 
             is_readed = false, 
             updated_at = NOW()
         WHERE id = $5
         RETURNING id, user_id, title_template, body_template, notification_type, reference_id, 
                   actors_count, last_actor_id, last_actor_name, is_readed, created_at, updated_at, link_url`,
        [newCount, last_actor_id, last_actor_name, body_template, existing.id]
      );
      return { notification: result.rows[0], isNew: false };
    } else {
      // Create new aggregated notification
      const result = await db.query(
        `INSERT INTO notifications (id, user_id, title_template, body_template, notification_type, reference_id, actors_count, last_actor_id, last_actor_name, link_url) 
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6, $7, $8) 
         RETURNING id, user_id, title_template, body_template, notification_type, reference_id, 
                   actors_count, last_actor_id, last_actor_name, is_readed, created_at, updated_at, link_url`,
        [user_id, title_template, body_template, notification_type, reference_id, last_actor_id, last_actor_name, link_url]
      );
      return { notification: result.rows[0], isNew: true };
    }
  }
}
