import "dotenv/config";
import fs from "fs";
import pkg from "pg";

import dotenv from "dotenv";
dotenv.config();

const { Client } = pkg;

const client = new Client({
  host: "localhost",
  port:  5432,
  database:  "notification_db",
  user:  "postgres",
  password:"postgres",
});

async function initDB() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    // Đọc file SQL
    const sql = fs.readFileSync("./init.sql", "utf8");

    // Chạy từng lệnh SQL trong file
    const commands = sql
      .split(";")
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd);
    for (const command of commands) {
      await client.query(command);
    }

    console.log("Database initialized successfully!");
  } catch (err) {
    console.error("Database initialization failed:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

initDB();
