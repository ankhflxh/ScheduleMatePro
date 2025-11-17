const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth"); // Import the secure middleware

// GET /api/meetings/me → meetings for rooms I belong to (Frontend dashboard.js fix)
router.get("/me", authenticateToken, async (req, res) => {
  // SECURE: Use authenticated ID, ignore req.query.userId
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT m.*, r.name AS room_name
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       JOIN room_members rm ON rm.room_id = r.id
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

// POST /api/meetings/:roomId (Only authenticated users can confirm)
// body: { meeting_day, start_time, end_time, location } - confirmed_by is now ignored from body
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { meeting_day, start_time, end_time, location } = req.body;
  // SECURE: Use authenticated ID for who confirmed the meeting
  const confirmed_by = req.user.id;

  try {
    const result = await pool.query(
      `INSERT INTO meetings (room_id, confirmed_by, meeting_day, start_time, end_time, location)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roomId, confirmed_by, meeting_day, start_time, end_time, location]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to confirm meeting" });
  }
});

// --- NEW/MISSING ROUTE FROM FRONTEND ANALYSIS ---

// GET /api/meetings/confirmed?roomId=1 (Frontend enterrooms.js fix)
router.get("/confirmed", authenticateToken, async (req, res) => {
  const { roomId } = req.query;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required." });
  }

  try {
    const result = await pool.query(
      `SELECT meeting_day AS day, start_time AS time, location
             FROM meetings
             WHERE room_id = $1
             ORDER BY created_at DESC
             LIMIT 1`, // Get the most recently confirmed meeting
      [roomId]
    );

    if (result.rows.length === 0) {
      // Return 404 if no confirmed meeting exists (as expected by enterrooms.js)
      return res
        .status(404)
        .json({ error: "No confirmed meeting found for this room." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("CONFIRMED MEETING ERROR:", err);
    res.status(500).json({ error: "Failed to fetch confirmed meeting." });
  }
});

module.exports = router;
