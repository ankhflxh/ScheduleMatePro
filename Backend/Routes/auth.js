// File: Backend/Routes/auth.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");
require("dotenv").config();

// Resend setup
const resend = new Resend(process.env.RESEND_API_KEY);

if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

// --- HELPER FUNCTIONS ---
const generateToken = (id) =>
  jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "7d" });

// Generates a random 6-digit code
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const authenticateToken = async (req, res, next) => {
  const token = req.headers["x-auth-token"] || req.cookies.sm_auth_token;
  if (!token)
    return res.status(401).json({ message: "Authentication required" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      "SELECT id, username, email, is_verified, has_seen_tour FROM users WHERE id = $1",
      [decoded.userId],
    );

    if (result.rows.length === 0)
      return res.status(403).json({ message: "Invalid token" });

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// --- ROUTES ---

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters." });
  if (username.length < 3)
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters." });

  const otp = generateOTP();
  const expires = new Date(Date.now() + 1000 * 60 * 15); // OTP expires in 15 mins

  let passwordHash;
  try {
    passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  } catch (err) {
    return res.status(500).json({ error: "Failed to process password." });
  }

  try {
    await pool.query(
      `INSERT INTO users (username, email, password_hash, is_verified, verification_token, verification_expires, has_seen_tour)
       VALUES ($1, $2, $3, FALSE, $4, $5, FALSE)`,
      [username, email, passwordHash, otp, expires],
    );

    res.json({ message: "otp_sent", email: email });
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "users_username_key")
        return res.status(400).json({ error: "Username taken." });
      if (err.constraint === "users_email_key")
        return res.status(400).json({ error: "Email already registered." });
    }
    return res
      .status(400)
      .json({ error: "Registration failed. Please try again." });
  }

  // Send the OTP via Email
  try {
    resend.emails
      .send({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your ScheduleMate Pro Verification Code",
        text: `Hello ${username},\n\nYour 6-digit verification code is: ${otp}\n\nIt expires in 15 minutes.`,
        html: `
        <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
          <h2>Verify Your Account</h2>
          <p>Hello <strong>${username}</strong>,</p>
          <p>Your 6-digit verification code is:</p>
          <h1 style="background: #f4f4f5; padding: 15px; letter-spacing: 5px; color: #10b981; border-radius: 8px;">${otp}</h1>
          <p>This code will expire in 15 minutes. Do not share it with anyone.</p>
        </div>
      `,
      })
      .catch(console.error);
  } catch (error) {
    console.error("Email preparation error:", error);
  }
});

// POST /api/auth/verify
router.post("/verify", async (req, res) => {
  const { email, otp } = req.body;

  try {
    const result = await pool.query(
      `SELECT * FROM users
       WHERE email = $1 AND verification_token = $2 AND verification_expires > NOW()`,
      [email, otp],
    );

    const user = result.rows[0];

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code." });
    }

    // Verify User
    await pool.query(
      `UPDATE users
       SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL
       WHERE id = $1`,
      [user.id],
    );

    // Auto-login after verification
    const token = generateToken(user.id);
    res.json({
      message: "Verification successful!",
      token: token,
      user: { user_id: user.id, username: user.username },
    });
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, username, email, password_hash, is_verified FROM users 
       WHERE username = $1 OR email = $1`,
      [identifier],
    );

    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: "Invalid credentials." });

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch)
      return res.status(400).json({ message: "Invalid credentials." });

    if (user.is_verified === false) {
      return res
        .status(403)
        .json({ message: "Account not verified. Please verify your email." });
    }

    const token = generateToken(user.id);
    res.json({
      token: token,
      user: { user_id: user.id, username: user.username },
      message: "Login successful",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error during login." });
  }
});

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  const { email } = req.body;

  try {
    const userResult = await pool.query(
      `SELECT id, username, is_verified FROM users WHERE email = $1`,
      [email],
    );
    const user = userResult.rows[0];

    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.is_verified)
      return res.status(400).json({ error: "Account is already verified." });

    const newOtp = generateOTP();
    const newExpires = new Date(Date.now() + 1000 * 60 * 15);

    await pool.query(
      `UPDATE users SET verification_token = $1, verification_expires = $2 WHERE id = $3`,
      [newOtp, newExpires, user.id],
    );

    res.json({ message: "New code sent." });

    resend.emails
      .send({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your New Verification Code",
        text: `Hello ${user.username},\n\nYour new verification code is: ${newOtp}`,
        html: `<h2>Your new code is: <span style="color:#10b981;">${newOtp}</span></h2>`,
      })
      .catch(console.error);
  } catch (err) {
    res.status(500).json({ error: "Failed to resend code." });
  }
});

// GET /api/users/me
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    user_id: req.user.id,
    user_username: req.user.username,
    email: req.user.email,
    is_verified: req.user.is_verified,
    has_seen_tour: req.user.has_seen_tour,
  });
});

router.post("/tour-complete", authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE users SET has_seen_tour = TRUE WHERE id = $1", [
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// PATCH /api/auth/update — update username, email, or password
router.patch("/update", authenticateToken, async (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    if (username !== undefined) {
      if (username.length < 3)
        return res
          .status(400)
          .json({ error: "Username must be at least 3 characters." });
      await pool.query("UPDATE users SET username = $1 WHERE id = $2", [
        username,
        userId,
      ]);
      return res.json({ success: true });
    }

    if (email !== undefined) {
      if (!email.includes("@"))
        return res.status(400).json({ error: "Invalid email address." });
      await pool.query("UPDATE users SET email = $1 WHERE id = $2", [
        email,
        userId,
      ]);
      return res.json({ success: true });
    }

    if (newPassword !== undefined) {
      if (!currentPassword)
        return res.status(400).json({ error: "Current password is required." });
      if (newPassword.length < 8)
        return res
          .status(400)
          .json({ error: "New password must be at least 8 characters." });

      const userRes = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [userId],
      );
      const match = await bcrypt.compare(
        currentPassword,
        userRes.rows[0].password_hash,
      );
      if (!match)
        return res
          .status(400)
          .json({ error: "Current password is incorrect." });

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        newHash,
        userId,
      ]);
      return res.json({ success: true });
    }

    return res.status(400).json({ error: "No update fields provided." });
  } catch (err) {
    if (err.code === "23505") {
      if (err.constraint === "users_username_key")
        return res.status(400).json({ error: "Username already taken." });
      if (err.constraint === "users_email_key")
        return res.status(400).json({ error: "Email already in use." });
    }
    console.error("Update error:", err);
    res.status(500).json({ error: "Update failed." });
  }
});

// DELETE /api/auth/delete — delete account (requires password confirmation)
router.delete("/delete", authenticateToken, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  if (!password)
    return res
      .status(400)
      .json({ error: "Password is required to delete your account." });

  try {
    const userRes = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );
    const match = await bcrypt.compare(password, userRes.rows[0].password_hash);
    if (!match) return res.status(400).json({ error: "Incorrect password." });

    // Delete user — cascade handles rooms/availability/notes/members
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    res.json({ success: true, message: "Account deleted." });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account." });
  }
});

module.exports = { router, authenticateToken };
