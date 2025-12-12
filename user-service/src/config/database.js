import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

// Cấu hình kết nối PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: process.env.DB_MAX_CONNECTIONS || 10,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Kiểm tra kết nối
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log(
      `Kết nối thành công đến PostgreSQL trên cổng ${
        process.env.DB_PORT || 5432
      }`
    );
    client.release();
  } catch (err) {
    console.error("Lỗi kết nối đến cơ sở dữ liệu:", err);
  }
};

testConnection();

export const query = (text, params) => pool.query(text, params);
export default pool;
