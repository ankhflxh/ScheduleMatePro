const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/meetings/me?userId=1 → meetings for rooms I belong to
router.get("/me", async (req, res) => {
  const userId = req.query.userId;
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

// POST /api/meetings/:roomId
// body: { confirmed_by, meeting_day, start_time, end_time, location }
router.post("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { confirmed_by, meeting_day, start_time, end_time, location } = req.body;

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

module.exports = router;
