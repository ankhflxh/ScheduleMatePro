const express = require("express");
const router = express.Router();
const pool = require("../db");

// GET /api/rooms/me?userId=1
router.get("/me", async (req, res) => {
  const userId = req.query.userId;
  try {
    const result = await pool.query(
      `SELECT r.*
       FROM room_members rm
       JOIN rooms r ON rm.room_id = r.id
       WHERE rm.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load rooms" });
  }
});

// POST /api/rooms  { name, code, creatorId }
router.post("/", async (req, res) => {
  const { name, code, creatorId } = req.body;
  try {
    // create room
    const roomResult = await pool.query(
      `INSERT INTO rooms (name, code, creator_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, code, creatorId]
    );

    const room = roomResult.rows[0];

    // add creator as member
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'creator')`,
      [room.id, creatorId]
    );

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to create room" });
  }
});

// GET /api/rooms/:roomId
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM rooms WHERE id = $1`,
      [roomId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load room" });
  }
});

module.exports = router;