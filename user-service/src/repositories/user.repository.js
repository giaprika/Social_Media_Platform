import * as db from "../config/database.js";

export class UserRepository {
  static async findUserById(id) {
    const result = await db.query(
      `SELECT id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata 
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findUserByEmail(email) {
    const result = await db.query(
      `SELECT id, email, full_name, birth_date, gender, status 
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
        (id, email, hashed_password, full_name, avatar_url, birth_date, gender, status, created_at, metadata) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9)
       RETURNING id, email, full_name, avatar_url, birth_date, gender, status, created_at, metadata`,
      [
        id,
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
}
