import * as db from "../config/database.js";

export class UserRepository {
  static async findUserById(id) {
    const result = await db.query(
      `SELECT id, username, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata 
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findUserByEmail(email) {
    const result = await db.query(
      `SELECT id, username, email, full_name, birth_date, gender, status 
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async findUserByEmailWithPassword(email) {
    const result = await db.query(
      `SELECT id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata, hashed_password
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  static async insertUser(userData) {
    const {
      id,
      username,
      email,
      hashed_password,
      full_name,
      avatar_url,
      birth_date,
      gender,
      metadata,
    } = userData;

    const result = await db.query(
      `INSERT INTO users 
        (id, username, email, hashed_password, full_name, avatar_url, birth_date, gender, status, created_at, metadata) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10)
       RETURNING id, username, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata`,
      [
        id,
        username,
        email,
        hashed_password,
        full_name,
        avatar_url || null,
        birth_date || null,
        gender || null,
        'active', // Default status for new users
        metadata || {},
      ]
    );
    return result.rows[0];
  }

  static async findUserByUsername(username) {
    const result = await db.query(
      `SELECT id, username, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata
       FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0] || null;
  }

  static async deleteUserById(id) {
    const result = await db.query(
      `DELETE FROM users WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async getUser() {
    const result = await db.query(
      `SELECT id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata 
       FROM users`
    );
    return result.rows;
  }

  static async searchUsersByName(fullName) {
    const result = await db.query(
      `SELECT id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata 
       FROM users 
       WHERE full_name ILIKE $1 AND status != 'banned'
       ORDER BY full_name ASC`,
      [`%${fullName}%`]
    );
    return result.rows;
  }

  static async updateUserStatus(userId, status) {
    const result = await db.query(
      `UPDATE users SET status = $1 WHERE id = $2 
       RETURNING id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata`,
      [status, userId]
    );
    return result.rows[0] || null;
  }

  static async getFollowersCount(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count 
       FROM relationships 
       WHERE target_id = $1 AND type = 'follow' AND status = 'accepted'`,
      [userId]
    );
    return parseInt(result.rows[0]?.count || 0, 10);
  }

  static async updateUser(userId, updateData) {
    const { email, username, full_name, birth_date, gender } = updateData;
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(full_name);
    }
    if (birth_date !== undefined) {
      updates.push(`birth_date = $${paramIndex++}`);
      values.push(birth_date);
    }
    if (gender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(gender);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update");
    }

    values.push(userId);
    const result = await db.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}
       RETURNING id, username, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata`,
      values
    );
    return result.rows[0] || null;
  }

  static async updatePassword(userId, hashedPassword) {
    const result = await db.query(
      `UPDATE users SET hashed_password = $1 WHERE id = $2
       RETURNING id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata`,
      [hashedPassword, userId]
    );
    return result.rows[0] || null;
  }

  static async getUserPassword(userId) {
    const result = await db.query(
      `SELECT hashed_password FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.hashed_password || null;
  }

  static async getUserSettings(userId) {
    const result = await db.query(
      `SELECT metadata FROM users WHERE id = $1`,
      [userId]
    );
    const metadata = result.rows[0]?.metadata || {};
    return metadata.settings || {};
  }

  static async updateUserSettings(userId, settings) {
    const result = await db.query(
      `UPDATE users 
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('settings', COALESCE(metadata->'settings', '{}'::jsonb) || $1::jsonb)
       WHERE id = $2
       RETURNING metadata`,
      [JSON.stringify(settings), userId]
    );
    const metadata = result.rows[0]?.metadata || {};
    return metadata.settings || {};
  }
}
