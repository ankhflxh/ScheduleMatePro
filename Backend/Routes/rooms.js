const express = require("express");
const router = express.Router();
const pool = require("../db");
// Import the secure authentication middleware
const { authenticateToken } = require("./auth"); // Assuming auth.js exports it

// GET /api/rooms/me (Frontend was calling /api/rooms/user/:userId - this fixes it)
router.get("/me", authenticateToken, async (req, res) => {
  // Use the ID from the secure JWT token payload
  const userId = req.user.id;
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

// POST /api/rooms  { name, code, creatorId } -> { name, code }
router.post("/", authenticateToken, async (req, res) => {
  const { name, code } = req.body;
  // Use the ID from the secure JWT token payload
  const creatorId = req.user.id;

  // NOTE: You need logic to GENERATE a unique code if the client isn't providing it.
  // Assuming 'code' is provided for now.

  try {
    // 1. Create room
    const roomResult = await pool.query(
      `INSERT INTO rooms (name, code, creator_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, code, creatorId]
    );

    const room = roomResult.rows[0];

    // 2. Add creator as member
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

// GET /api/rooms/:roomId (Remains largely the same)
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [
      roomId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load room" });
  }
});

// --- NEW/MISSING ROUTES FROM FRONTEND ANALYSIS ---

// DELETE /api/rooms/:roomId/leave (Frontend dashboard.js fix)
router.delete("/:roomId/leave", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id; // Securely get user ID

  try {
    const deleteResult = await pool.query(
      `DELETE FROM room_members 
             WHERE room_id = $1 AND user_id = $2
             RETURNING *`,
      [roomId, userId]
    );

    if (deleteResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "User is not a member of this room." });
    }

    // NOTE: For 'creator' role, you should add logic to transfer ownership
    // or auto-delete the room if no one else is left.

    res.json({ message: "Successfully left the room." });
  } catch (err) {
    console.error("LEAVE ROOM ERROR:", err);
    res.status(500).json({ error: "Failed to leave room." });
  }
});

// POST /api/rooms/join (Frontend dashboard.js fix)
router.post("/join", authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.user.id; // Securely get user ID

  try {
    // 1. Find the room by code
    const roomResult = await pool.query(
      `SELECT id FROM rooms WHERE code = $1`,
      [inviteCode]
    );

    if (roomResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Invalid invite code or room not found." });
    }

    const roomId = roomResult.rows[0].id;

    // 2. Add user to room_members
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
             VALUES ($1, $2, 'member')
             ON CONFLICT (room_id, user_id) DO NOTHING`, // Prevent duplicate joins
      [roomId, userId]
    );

    res.json({ message: "Successfully joined room.", roomId: roomId });
  } catch (err) {
    console.error("JOIN ROOM ERROR:", err);
    res.status(500).json({ error: "Failed to join room." });
  }
});

// PATCH /api/rooms/:roomId/theme (Frontend settings.js fix)
router.patch("/:roomId/theme", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { theme } = req.body; // 'dark' or 'light'
  const userId = req.user.id;

  // Optional: Check if the user is a member of the room before allowing update
  const isMember = await pool.query(
    `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );

  if (isMember.rows.length === 0) {
    return res
      .status(403)
      .json({ error: "You are not authorized to update this room." });
  }

  try {
    await pool.query(`UPDATE rooms SET theme = $1 WHERE id = $2`, [
      theme,
      roomId,
    ]);
    res.json({ message: "Theme updated successfully." });
  } catch (err) {
    console.error("THEME UPDATE ERROR:", err);
    res.status(500).json({ error: "Failed to update room theme." });
  }
});

module.exports = router;
