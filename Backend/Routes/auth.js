// auth.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
require("dotenv").config();

// ADD: Import and configure SendGrid
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- HELPER FUNCTIONS AND MIDDLEWARE ---

// Simple token generation (replace with JWT in production)
const generateToken = (id) => {
  return Buffer.from(String(id)).toString("base64");
};

// Middleware to find user by simple token (for /api/users/me)
const authenticateToken = async (req, res, next) => {
  // Use header first, then check cookies/query/body (as per dashboard.js fix)
  const token =
    req.headers["x-auth-token"] ||
    req.cookies.sm_auth_token ||
    req.query.token ||
    req.body.token;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Authentication required (No token provided)" });
  }

  try {
    // Decode the base64 token to get the user ID
    const userId = Number(Buffer.from(token, "base64").toString("ascii"));

    // Check for user existence
    const result = await pool.query(
      "SELECT id, username, email, is_verified FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0)
      return res.status(403).json({ message: "Invalid token" });

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error("Token Authentication Error:", err);
    // Return 403 for invalid token format (prevents 500)
    return res.status(403).json({ message: "Invalid token format" });
  }
};

// ----------------------------------------------------
// ROUTES
// ----------------------------------------------------

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

    // 2) ***IMMEDIATELY SEND SUCCESS RESPONSE***
    res.json({ message: "verification_sent" });
  } catch (err) {
    // 3) Error handling for duplicate key or DB insert failure
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
    // Only send 400 status if no response was sent yet
    if (!res.headersSent) {
      res.status(400).json({ error: "Registration failed. Please try again." });
    }
    return;
  }

  // 4) ***SEND EMAIL OUTSIDE OF THE MAIN TRY/CATCH (Non-blocking)***
  try {
    const verifyLink = `${process.env.APP_BASE_URL}/api/auth/verify?token=${token}`;
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

// POST /api/login
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body; // identifier can be username or email

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

    // WARNING: Plain text password comparison!
    if (user.password_hash !== password) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    if (user.is_verified === false) {
      return res.status(403).json({
        message:
          "Account not verified. Check your email for the verification link.",
      });
    }

    // Success: Generate and return token
    const token = generateToken(user.id);

    // Frontend expects token and user info
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
  // req.user is set by the authenticateToken middleware
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
      `SELECT id, username, is_verified, verification_expires FROM users WHERE email = $1`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.is_verified) {
      return res.status(400).json({ error: "Account is already verified." });
    }

    // Generate new token and expiry
    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

    await pool.query(
      `UPDATE users
       SET verification_token = $1, verification_expires = $2
       WHERE id = $3`,
      [newToken, newExpires, user.id]
    );

    res.json({ message: "Verification link successfully resent." });

    // Send email non-blocking
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
    // Send error response if headers were not sent by the res.json above
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to resend verification link." });
    }
  }
});

module.exports = router;