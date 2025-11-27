// File: Backend/Routes/auth.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

// SendGrid setup
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// SECURITY: Enforce secret presence
if (!process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

// --- HELPER FUNCTIONS AND MIDDLEWARE ---

const generateToken = (id) => {
  return jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "7d" });
};

const authenticateToken = async (req, res, next) => {
  const token = req.headers["x-auth-token"] || req.cookies.sm_auth_token;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authentication required (No token provided)" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    const result = await pool.query(
      "SELECT id, username, email, is_verified FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0)
      return res.status(403).json({ message: "Invalid or unauthorized token" });

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error("Token Authentication Error:", err);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// ----------------------------------------------------
// ROUTES
// ----------------------------------------------------

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  // 🛡️ SECURITY: Backend Validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters." });
  }
  if (username.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters." });
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

  let passwordHash;
  try {
    passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  } catch (hashErr) {
    console.error("BCRYPT HASH ERROR:", hashErr);
    return res.status(500).json({ error: "Failed to process password." });
  }

  try {
    await pool.query(
      `INSERT INTO users (username, email, password_hash, is_verified, verification_token, verification_expires)
       VALUES ($1, $2, $3, FALSE, $4, $5)`,
      [username, email, passwordHash, verificationToken, expires]
    );

    res.json({ message: "verification_sent" });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
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
    if (!res.headersSent) {
      res.status(400).json({ error: "Registration failed. Please try again." });
    }
    return;
  }

  // Non-blocking Email
  try {
    const verifyLink = `${process.env.APP_BASE_URL}/api/auth/verify?token=${verificationToken}`;
    const msg = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Verify Your New Account for ScheduleMate Pro",
      text: `Hello ${username}, please verify your email here: ${verifyLink}`,
      html: `<strong>Hello ${username}, please click <a href="${verifyLink}">here</a> to verify your account.</strong>`,
    };
    sgMail.send(msg).catch((emailErr) => {
      console.error("SENDGRID ASYNC ERROR:", emailErr);
    });
  } catch (emailError) {
    console.error("Email preparation error:", emailError);
  }
});

// GET /api/auth/verify
router.get("/verify", async (req, res) => {
  const { token } = req.query;

  try {
    const result = await pool.query(
      `SELECT * FROM users
       WHERE verification_token = $1 AND verification_expires > NOW()`,
      [token]
    );

    const user = result.rows[0];

    if (!user) {
      return res.redirect(
        `${
          process.env.APP_BASE_URL
        }/LoginPage/login.html?error=${encodeURIComponent(
          "Verification link is invalid or expired. Please request a new one."
        )}`
      );
    }

    await pool.query(
      `UPDATE users
       SET is_verified = TRUE, verification_token = NULL, verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    res.redirect(`${process.env.APP_BASE_URL}/LoginPage/login.html?verified=1`);
  } catch (err) {
    console.error("VERIFY ERROR:", err);
    res.redirect(
      `${
        process.env.APP_BASE_URL
      }/LoginPage/login.html?error=${encodeURIComponent(
        "An unexpected error occurred during verification."
      )}`
    );
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, username, email, password_hash, is_verified FROM users 
       WHERE username = $1 OR email = $1`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    if (user.is_verified === false) {
      return res.status(403).json({
        message:
          "Account not verified. Check your email for the verification link.",
      });
    }

    const token = generateToken(user.id);

    res.json({
      token: token,
      user: { user_id: user.id, username: user.username },
      message: "Login successful",
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// GET /api/users/me
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    user_id: req.user.id,
    user_username: req.user.username,
    email: req.user.email,
    is_verified: req.user.is_verified,
  });
});

// POST /api/auth/resend-verification
router.post("/resend-verification", async (req, res) => {
  const { email } = req.body;

  try {
    const userResult = await pool.query(
      `SELECT id, username, is_verified FROM users WHERE email = $1`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.is_verified) {
      return res.status(400).json({ error: "Account is already verified." });
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

    await pool.query(
      `UPDATE users
       SET verification_token = $1, verification_expires = $2
       WHERE id = $3`,
      [newToken, newExpires, user.id]
    );

    res.json({ message: "Verification link successfully resent." });

    const verifyLink = `${process.env.APP_BASE_URL}/api/auth/verify?token=${newToken}`;
    const msg = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "New Verification Link for ScheduleMate Pro",
      text: `Hello ${user.username}, please verify your email here: ${verifyLink}`,
      html: `<strong>Hello ${user.username}, please click <a href="${verifyLink}">here</a> to verify your account.</strong>`,
    };

    sgMail.send(msg).catch((emailErr) => {
      console.error("RESEND EMAIL ASYNC ERROR:", emailErr);
    });
  } catch (err) {
    console.error("RESEND ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to resend verification link." });
    }
  }
});

module.exports = {
  router: router,
  authenticateToken: authenticateToken,
};
