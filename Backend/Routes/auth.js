const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

  try {
    // 1) create user as NOT verified
    await pool.query(
      `INSERT INTO users (username, email, password_hash, is_verified, verification_token, verification_expires)
       VALUES ($1, $2, $3, FALSE, $4, $5)`,
      [username, email, password, token, expires]
    ); // 2) build verify link

    const verifyLink = `${process.env.APP_BASE_URL}/api/auth/verify?token=${token}`; // 3) respond FIRST so frontend is happy

    res.json({ message: "verification_sent" }); // 4) now try to send the email in the background

    transporter; // ... (email sending logic)
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    // 💡 START OF MODIFIED CODE 💡
    // PostgreSQL unique violation error code is typically '23505'.
    // We check the error code and the field name (column) to give a specific message.
    if (err.code === "23505") {
      if (err.constraint === "users_username_key") {
        return res
          .status(400)
          .json({ error: "The username you entered is already taken." });
      }
      if (err.constraint === "users_email_key") {
        return res
          .status(400)
          .json({ error: "That email address is already registered." });
      }
    } // only gets here if DB insert failed for another reason

    res.status(400).json({ error: "Registration failed. Please try again." });
    // 💡 END OF MODIFIED CODE 💡
  }
});

// GET /api/auth/verify?token=xxxx
router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Invalid token");

  try {
    const result = await pool.query(
      `SELECT id, verification_expires FROM users WHERE verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send("Invalid or used token");
    }

    const user = result.rows[0];

    if (
      user.verification_expires &&
      new Date(user.verification_expires) < new Date()
    ) {
      return res.status(400).send("Verification link expired");
    }

    await pool.query(
      `UPDATE users
       SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    res.send("Email verification successful. You can close this and log in.");
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
