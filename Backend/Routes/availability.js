const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth"); // Import the secure middleware

// --- HELPER FUNCTION FOR TIME CALCULATION ---
// Converts 'HH:MM' string to total minutes from midnight.
const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

// GET /api/availability/:roomId  → all members' availability (no auth needed, public view)
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT a.*, u.username
       FROM availability a
       JOIN users u ON a.user_id = u.id
       WHERE a.room_id = $1`,
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load availability" });
  }
});

// GET /api/availability/:roomId/me (No longer needs userId in query string)
router.get("/:roomId/me", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  // SECURE: Use authenticated ID, ignore req.query.userId
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM availability
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    if (result.rows.length === 0) {
      // Returning 404/empty is fine, the FE handles null
      return res.json(null);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load your availability" });
  }
});

// POST /api/availability/:roomId
// body: { day, start_time, end_time, location } - userId is now ignored from body
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { day, start_time, end_time, location } = req.body;
  // SECURE: Use authenticated ID, ignore req.body.userId
  const userId = req.user.id;

  // Basic validation (check for missing fields)
  if (!day || !start_time || !end_time) {
    return res
      .status(400)
      .json({ error: "Missing required availability fields." });
  }

  try {
    // 1. 🟢 NEW: Check if the room has required scheduling preferences set
    const roomPrefsResult = await pool.query(
      `SELECT meeting_interval, meeting_day FROM rooms WHERE id = $1`,
      [roomId]
    );

    if (roomPrefsResult.rows.length === 0) {
      return res.status(404).json({ error: "Room not found." });
    }

    const { meeting_interval, meeting_day } = roomPrefsResult.rows[0];

    // Check 1.1: If preferences are not set by creator
    if (!meeting_interval || !meeting_day) {
      return res
        .status(403)
        .json({
          error: "Creator must set the meeting interval and day first.",
        });
    }

    // Check 1.2: Enforce selected day matches creator's day
    if (day !== meeting_day) {
      return res
        .status(400)
        .json({
          error: `Availability must be submitted for the chosen day: ${meeting_day}.`,
        });
    }

    // Check 1.3: Enforce time interval matches creator's interval
    const startMinutes = timeToMinutes(start_time);
    const endMinutes = timeToMinutes(end_time);
    const submittedDurationMinutes = endMinutes - startMinutes;
    const requiredDurationMinutes = meeting_interval * 60; // Convert hours to minutes

    if (submittedDurationMinutes !== requiredDurationMinutes) {
      return res.status(400).json({
        error: `Your time slot must be exactly ${meeting_interval} hour(s) long, based on the creator's preference.`,
      });
    }

    // upsert style: try update first
    const update = await pool.query(
      `UPDATE availability
       SET day = $1, start_time = $2, end_time = $3, location = $4, updated_at = CURRENT_TIMESTAMP
       WHERE room_id = $5 AND user_id = $6
       RETURNING *`,
      [day, start_time, end_time, location, roomId, userId]
    );

    if (update.rows.length > 0) {
      return res.json(update.rows[0]);
    }

    // else insert
    const insert = await pool.query(
      `INSERT INTO availability (room_id, user_id, day, start_time, end_time, location)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roomId, userId, day, start_time, end_time, location]
    );

    res.json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    // Use a generic 500 error for uncaught database/server issues
    res
      .status(500)
      .json({ error: "Failed to save availability due to a server error." });
  }
});

module.exports = router;
