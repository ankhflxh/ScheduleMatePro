// auth.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
// REMOVE: const nodemailer = require("nodemailer");
require("dotenv").config();

// ADD: Import and configure SendGrid
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
    );

    // 2) build verify link
    const verifyLink = `${process.env.APP_BASE_URL}/api/auth/verify?token=${token}`;

    // 3) respond FIRST so frontend is happy
    res.json({ message: "verification_sent" });

    // 4) now try to send the email in the background (ASYNC)
    const msg = {
      to: email, // Recipient email
      // Use the authenticated 'FROM' address from your domain
      from: process.env.EMAIL_USER,
      subject: "Verify Your New Account for ScheduleMate Pro",
      text: `Hello ${username}, please verify your email here: ${verifyLink}`,
      html: `<strong>Hello ${username}, please click <a href="${verifyLink}">here</a> to verify your account.</strong>`,
    };

    // Use SendGrid API to send the message
    await sgMail.send(msg);
  } catch (err) {
    // ... (Your existing error handling logic)
    console.error("REGISTER ERROR:", err);
    // ... (rest of the error handling remains the same)
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
    }

    res.status(400).json({ error: "Registration failed. Please try again." });
  }
});

// ... (rest of auth.js remains the same)
module.exports = router;
