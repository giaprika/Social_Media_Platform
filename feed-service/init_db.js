const { Pool } = require("pg");

async function initDB() {
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: "postgres", // Connect to default database first
  });

  try {
    // Check if database exists
    const checkDB = await pool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [process.env.DB_NAME || "feed_db"]
    );

    if (checkDB.rows.length === 0) {
      // Create database if it doesn't exist
      await pool.query(`CREATE DATABASE ${process.env.DB_NAME || "feed_db"}`);
      console.log("Database created successfully");
    } else {
      console.log("Database already exists");
    }

    await pool.end();
    console.log("Database initialization complete");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
}

initDB();
