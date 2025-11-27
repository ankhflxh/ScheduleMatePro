// File: Backend/Routes/availability.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");

// GET /api/availability/:roomId
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

// GET /api/availability/:roomId/me
router.get("/:roomId/me", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM availability
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    if (result.rows.length === 0) {
      return res.json(null);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load your availability" });
  }
});

// POST /api/availability/:roomId
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { day, start_time, location } = req.body; // NOTE: We ignore end_time from body
  const userId = req.user.id;

  if (!day || !start_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1. Fetch Room Interval
    const roomRes = await pool.query(
      "SELECT meeting_interval FROM rooms WHERE id = $1",
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const interval = parseInt(roomRes.rows[0].meeting_interval) || 1;

    // 2. Calculate End Time Server-Side
    const [startH, startM] = start_time.split(":").map(Number);
    let endH = startH + interval;

    // Optional: Handle midnight wrap-around (e.g. 23:00 + 2h = 01:00)
    // For now, we'll keep it simple as the frontend usually limits times to 22:00
    if (endH >= 24) endH -= 24;

    const end_time = `${String(endH).padStart(2, "0")}:${String(
      startM
    ).padStart(2, "0")}`;

    // 3. Upsert Logic
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

    const insert = await pool.query(
      `INSERT INTO availability (room_id, user_id, day, start_time, end_time, location)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roomId, userId, day, start_time, end_time, location]
    );

    res.json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to save availability" });
  }
});

module.exports = router;
