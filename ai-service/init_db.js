import fs from "fs";
import pkg from "pg";

import dotenv from "dotenv";

dotenv.config();

const { Client } = pkg;

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function initDB() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    // Read SQL file
    const sql = fs.readFileSync("./init.sql", "utf8");

    // Execute each SQL command
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