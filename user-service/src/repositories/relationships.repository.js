import * as db from "../config/database.js";

export class RelationshipsRepository {
  static async insertRelationship(data) {
    const { id, user_id, target_id, type, status } = data;
    const result = await db.query(
      `INSERT INTO relationships (id, user_id, target_id, type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, user_id, target_id, type, status]
    );
    return result.rows[0];
  }

  static async findBetween(userId, targetId) {
    const result = await db.query(
      `SELECT * FROM relationships
       WHERE (user_id = $1 AND target_id = $2)
          OR (user_id = $2 AND target_id = $1)
       LIMIT 1`,
      [userId, targetId]
    );
    return result.rows[0] || null;
  }

  static async deleteBetween(userId, targetId) {
    const result = await db.query(
      `DELETE FROM relationships
       WHERE (user_id = $1 AND target_id = $2)
          OR (user_id = $2 AND target_id = $1)
       RETURNING *`,
      [userId, targetId]
    );
    return result.rows; // may be multiple rows
  }

  static async listFriends(userId) {
    const result = await db.query(
      `SELECT 
         r.id,
         r.user_id,
         r.target_id,
         r.type,
         r.status,
         r.created_at,
         r.updated_at,
         CASE 
           WHEN r.user_id = $1 THEN jsonb_build_object(
             'id', u1.id,
             'email', u1.email,
             'full_name', u1.full_name,
             'avatar_url', u1.avatar_url,
             'birth_date', u1.birth_date,
             'gender', u1.gender,
             'created_at', u1.created_at,
             'metadata', u1.metadata
           )
           ELSE jsonb_build_object(
             'id', u2.id,
             'email', u2.email,
             'full_name', u2.full_name,
             'avatar_url', u2.avatar_url,
             'birth_date', u2.birth_date,
             'gender', u2.gender,
             'created_at', u2.created_at,
             'metadata', u2.metadata
           )
         END as friend_info
       FROM relationships r
       LEFT JOIN users u1 ON r.target_id = u1.id
       LEFT JOIN users u2 ON r.user_id = u2.id
       WHERE r.type = 'friend' AND r.status = 'accepted' AND (r.user_id = $1 OR r.target_id = $1)
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async listFollowers(userId) {
    const result = await db.query(
      `SELECT 
         r.id,
         r.user_id,
         r.target_id,
         r.type,
         r.status,
         r.created_at,
         r.updated_at,
         jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'full_name', u.full_name,
           'avatar_url', u.avatar_url,
           'birth_date', u.birth_date,
           'gender', u.gender,
           'created_at', u.created_at,
           'metadata', u.metadata
         ) as follower_info
       FROM relationships r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.type = 'follow' AND r.target_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async updateStatus(id, status) {
    const result = await db.query(
      `UPDATE relationships SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0] || null;
  }
}
