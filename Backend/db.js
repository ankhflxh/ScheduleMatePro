// File: Backend/db.js
const { Pool } = require("pg");
require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL is not defined in .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // In production, you likely want 'true' or strict CA checking.
    // 'rejectUnauthorized: false' is common for Heroku/Render free tiers.
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("Unexpected PG error", err);
  process.exit(-1);
});

module.exports = pool;