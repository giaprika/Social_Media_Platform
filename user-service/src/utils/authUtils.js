import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import * as db from "../config/database.js";

// Số vòng lặp cho bcrypt
const SALT_ROUNDS = 10;

// Tạo mật khẩu hash
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return await bcrypt.hash(password, salt);
};

// So sánh mật khẩu
export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Ghi lại thông tin token (được tạo bởi API Gateway)
export const recordToken = async (userId, token, expiresAt) => {
  const tokenId = uuidv4();

  await db.query(
    `INSERT INTO auth_tokens (id, user_id, token, created_at, expires_at, last_used_at, is_revoked) 
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, CURRENT_TIMESTAMP, false)`,
    [tokenId, userId, token, expiresAt]
  );
};
