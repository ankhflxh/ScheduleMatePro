const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/availability/:roomId  → all members' availability
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

// GET /api/availability/:roomId/me?userId=1
router.get("/:roomId/me", async (req, res) => {
  const { roomId } = req.params;
  const userId = req.query.userId;
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
// body: { userId, day, start_time, end_time, location }
router.post("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { userId, day, start_time, end_time, location } = req.body;

  try {
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
    res.status(400).json({ error: "Failed to save availability" });
  }
});

module.exports = router;
