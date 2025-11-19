const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// FIX: Do not exit the process on error. Just log it.
pool.on("error", (err) => {
  console.error("Unexpected PG error", err);
  // process.exit(-1); // REMOVED: This was killing your server
});

module.exports = pool;
