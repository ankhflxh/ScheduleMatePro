// File: Backend/Routes/meetings.js

// ... (Existing imports and logic for /me and /:roomId POST remain unchanged) ...
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// GET /api/meetings/me (Already exists - we will filter this on Frontend)
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT m.*, r.name AS room_name, u.username AS confirmed_by_username
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       JOIN room_members rm ON rm.room_id = r.id
       JOIN users u ON m.confirmed_by = u.id
       WHERE rm.user_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load meetings" });
  }
});

// NEW ROUTE: Get ALL meetings for a room (for History/Status view)
router.get("/history/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT meeting_day, start_time, end_time, location, created_at
             FROM meetings
             WHERE room_id = $1
             ORDER BY created_at DESC`,
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ error: "Failed to fetch meeting history" });
  }
});

// ... (Existing POST /:roomId and GET /confirmed routes remain unchanged) ...
router.post("/:roomId", authenticateToken, async (req, res) => {
  // ... (Keep your existing POST logic with Email notifications) ...
  // Note: Ensure you are using the version I gave you previously
  // that includes the email sending logic!
  const { roomId } = req.params;
  const { meeting_day, start_time, end_time, location } = req.body;
  const confirmed_by = req.user.id;

  try {
    const roomCheck = await pool.query(
      "SELECT creator_id, name FROM rooms WHERE id = $1",
      [roomId]
    );
    if (roomCheck.rows.length === 0)
      return res.status(404).json({ error: "Room not found." });

    const room = roomCheck.rows[0];
    if (String(room.creator_id) !== String(confirmed_by)) {
      return res.status(403).json({ error: "Only creator can confirm." });
    }

    const result = await pool.query(
      `INSERT INTO meetings (room_id, confirmed_by, meeting_day, start_time, end_time, location)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [roomId, confirmed_by, meeting_day, start_time, end_time, location]
    );

    // Send Email Logic (Abbreviated here - assume it's the code from previous step)
    // ...

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to confirm" });
  }
});

router.get("/confirmed", authenticateToken, async (req, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: "Room ID required" });
  try {
    const result = await pool.query(
      `SELECT meeting_day AS day, start_time AS time, location
             FROM meetings WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [roomId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No confirmed meeting" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Fetch error" });
  }
});

module.exports = router;
