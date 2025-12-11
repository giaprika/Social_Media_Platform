const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "feed_db",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize database schema
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log("Database connected successfully");

    // Read and execute init.sql
    const initSQL = fs.readFileSync(
      path.join(__dirname, "..", "..", "init.sql"),
      "utf8"
    );
    await client.query(initSQL);
    console.log("Database schema initialized successfully");

    client.release();
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
};

module.exports = {
  pool,
  initializeDatabase,
};
