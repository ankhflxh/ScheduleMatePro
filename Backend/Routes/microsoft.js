// File: Backend/Routes/microsoft.js
// Microsoft OAuth 2.0 - Authorization Code Flow (no extra libraries needed)

const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || "common";
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI; // e.g. https://yourapp.com/api/auth/microsoft/callback

const generateToken = (id) =>
  jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "7d" });

// ─── In-memory state store (prevents CSRF) ───────────────────────
// In production with multiple instances you'd use Redis, but this is fine for a single server
const stateStore = new Map();

// ─── STEP 1: Redirect user to Microsoft login ────────────────────
// GET /api/auth/microsoft
router.get("/", (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res
      .status(500)
      .send("Microsoft OAuth is not configured. Check your .env file.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  // Store state for 10 minutes
  stateStore.set(state, Date.now());
  setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: ["openid", "profile", "email", "offline_access", "User.Read"].join(
      " ",
    ),
    state,
    // Prompt 'select_account' lets users switch accounts easily
    prompt: "select_account",
  });

  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
  res.redirect(authUrl);
});

// ─── STEP 2: Microsoft redirects back here with a code ───────────
// GET /api/auth/microsoft/callback
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const appBase = process.env.APP_BASE_URL || "";

  // Handle errors from Microsoft (e.g. user cancelled)
  if (error) {
    console.error("Microsoft OAuth error:", error, error_description);
    return res.redirect(
      `${appBase}/LoginPage/login.html?error=microsoft_cancelled`,
    );
  }

  // Validate state (CSRF protection)
  if (!state || !stateStore.has(state)) {
    return res.redirect(`${appBase}/LoginPage/login.html?error=invalid_state`);
  }
  stateStore.delete(state);

  if (!code) {
    return res.redirect(`${appBase}/LoginPage/login.html?error=no_code`);
  }

  try {
    // ── Exchange code for tokens ──────────────────────────────────
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      },
    );

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return res.redirect(
        `${appBase}/LoginPage/login.html?error=token_exchange_failed`,
      );
    }

    const { access_token, refresh_token, id_token } = tokenData;

    // ── Decode id_token for basic profile (no Graph call needed) ──
    let email = null;
    let displayName = null;

    try {
      const payload = JSON.parse(
        Buffer.from(id_token.split(".")[1], "base64").toString("utf8"),
      );
      email = (
        payload.email ||
        payload.preferred_username ||
        payload.upn ||
        ""
      ).toLowerCase();
      displayName = payload.name || payload.given_name || email.split("@")[0];
    } catch (e) {
      console.error("id_token decode failed:", e);
    }

    // ── Fallback: try Graph API if id_token did not have email ────
    if (!email) {
      try {
        const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const profile = await profileRes.json();
        if (profileRes.ok) {
          email = (
            profile.mail ||
            profile.userPrincipalName ||
            ""
          ).toLowerCase();
          displayName =
            profile.displayName || profile.givenName || email.split("@")[0];
        } else {
          console.error("Graph API failed:", profile);
        }
      } catch (e) {
        console.error("Graph fetch error:", e);
      }
    }

    if (!email) {
      return res.redirect(
        `${appBase}/LoginPage/login.html?error=profile_failed`,
      );
    }

    // Sanitise display name into a username-safe string
    // e.g. "Ashley King" -> "AshleyKing", then truncate to 30 chars
    const rawUsername = displayName.replace(/\s+/g, "").slice(0, 30);

    // ── Find or create user ───────────────────────────────────────
    let user;

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      // Returning Microsoft user — update their tokens
      user = existing.rows[0];
      await pool.query(
        `UPDATE users
         SET microsoft_access_token = $1,
             microsoft_refresh_token = $2
         WHERE id = $3`,
        [access_token, refresh_token || null, user.id],
      );
    } else {
      // New user — create account (no password needed for OAuth users)
      // Make the username unique if it collides
      let username = rawUsername;
      let suffix = 1;
      while (true) {
        const clash = await pool.query(
          "SELECT id FROM users WHERE username = $1",
          [username],
        );
        if (clash.rows.length === 0) break;
        username = rawUsername + suffix++;
      }

      const result = await pool.query(
        `INSERT INTO users
           (username, email, password_hash, is_verified, has_seen_tour,
            microsoft_access_token, microsoft_refresh_token)
         VALUES ($1, $2, $3, TRUE, FALSE, $4, $5)
         RETURNING *`,
        [
          username,
          email,
          "MICROSOFT_OAUTH", // placeholder — not a real hash, login via OAuth only
          access_token,
          refresh_token || null,
        ],
      );
      user = result.rows[0];
    }

    // ── Issue your app's JWT and redirect to dashboard ────────────
    const appToken = generateToken(user.id);

    // Pass token via URL fragment — never in a query param in production,
    // but since your app already uses localStorage this is the simplest
    // approach that matches your existing login flow
    res.redirect(
      `${appBase}/LoginPage/microsoft-callback.html#token=${appToken}&username=${encodeURIComponent(user.username)}&user_id=${user.id}`,
    );
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    res.redirect(`${appBase}/LoginPage/login.html?error=server_error`);
  }
});

module.exports = router;
