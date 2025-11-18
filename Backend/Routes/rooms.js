const express = require("express");
const router = express.Router();
const pool = require("../db");
// Import the secure authentication middleware
const { authenticateToken } = require("./auth");

// --- NEW HELPER FUNCTION TO GENERATE A UNIQUE CODE ---
async function generateUniqueRoomCode() {
  let code;
  let exists = true;

  // Loop until a unique 6-character alphanumeric code is found
  while (exists) {
    // Generate a random 6-character alphanumeric code (uppercase alphanumeric)
    code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Check database for code existence
    const result = await pool.query("SELECT code FROM rooms WHERE code = $1", [
      code,
    ]);
    exists = result.rows.length > 0;
  }
  return code;
}
// --- END NEW HELPER FUNCTION ---

// GET /api/rooms/me
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

// POST /api/rooms (Room Creation)
router.post("/", authenticateToken, async (req, res) => {
  const { name } = req.body; // ONLY takes name from body
  const creatorId = req.user.id; // Securely get creator ID from JWT

  // 1. Generate guaranteed unique code
  const uniqueCode = await generateUniqueRoomCode();

  try {
    // 2. Create room
    const roomResult = await pool.query(
      `INSERT INTO rooms (name, code, creator_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, uniqueCode, creatorId] // Use the uniqueCode
    );

    const room = roomResult.rows[0];

    // 3. Add creator as member
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'creator')`,
      [room.id, creatorId]
    );

    // Return the room, including the newly generated unique code
    res.json(room);
  } catch (err) {
    console.error("ROOM CREATION ERROR:", err);
    res.status(500).json({
      error:
        "Failed to create room due to server issue or database constraint.",
    });
  }
});

// GET /api/rooms/:roomId
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    // MODIFIED: Selecting all fields ensures new columns (meeting_interval, meeting_day) are included
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

// DELETE /api/rooms/:roomId/leave
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

    res.json({ message: "Successfully left the room." });
  } catch (err) {
    console.error("LEAVE ROOM ERROR:", err);
    res.status(500).json({ error: "Failed to leave room." });
  }
});

// POST /api/rooms/join
router.post("/join", authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.user.id; // Securely get user ID

  // FIX: Convert the incoming code to uppercase for reliable matching
  const uppercaseCode = inviteCode.toUpperCase();

  try {
    // 1. Find the room by code
    const roomResult = await pool.query(
      `SELECT id FROM rooms WHERE code = $1`,
      [uppercaseCode] // Use the normalized, uppercase code
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

// PATCH /api/rooms/:roomId/theme
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

// GET /api/rooms/:roomId/users -> Returns all members of a room
router.get("/:roomId/users", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id; // Authenticated user ID

  try {
    // SECURITY CHECK: Ensure the authenticated user is a member of the room
    const isMember = await pool.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );

    if (isMember.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "You are not a member of this room." });
    }

    // Fetch all members' details
    const result = await pool.query(
      `SELECT u.id AS user_id, u.username AS user_username, rm.role
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $1`,
      [roomId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("LOAD PARTICIPANTS ERROR:", err);
    res.status(500).json({ error: "Failed to load participants." });
  }
});

// GET /api/rooms/:roomId/creator -> Returns the creator ID
router.get("/:roomId/creator", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id; // Authenticated user ID

  try {
    // SECURITY CHECK: Ensure the authenticated user is a member of the room
    const isMember = await pool.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );

    if (isMember.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "You are not a member of this room." });
    }

    // Fetch the creator_id
    const result = await pool.query(
      `SELECT creator_id FROM rooms WHERE id = $1`,
      [roomId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found." });
    }

    // Frontend expects { creator_id: ... }
    res.json({ creator_id: result.rows[0].creator_id });
  } catch (err) {
    console.error("LOAD CREATOR ERROR:", err);
    res.status(500).json({ error: "Failed to load creator info." });
  }
});

// ----------------------------------------------------
// 🟢 NEW FEATURE ROUTE: SET CREATOR PREFERENCES (Step 1)
// ----------------------------------------------------

// PATCH /api/rooms/:roomId/schedule-preference
// Allows ONLY the creator to set the initial meeting interval and day
router.patch(
  "/:roomId/schedule-preference",
  authenticateToken,
  async (req, res) => {
    const { roomId } = req.params;
    const { interval, day } = req.body; // interval: 1, 2, 3 (hours). day: 'Monday', 'Tuesday', etc.
    const userId = req.user.id; // Securely get authenticated user ID

    try {
      // 1. Check if the authenticated user is the creator of the room
      const roomCheck = await pool.query(
        `SELECT creator_id FROM rooms WHERE id = $1`,
        [roomId]
      );

      if (roomCheck.rows.length === 0) {
        return res.status(404).json({ error: "Room not found." });
      }

      if (roomCheck.rows[0].creator_id !== userId) {
        return res.status(403).json({
          error: "Only the room creator can set scheduling preferences.",
        });
      }

      // 2. Validate inputs
      if (![1, 2, 3].includes(interval) || !day) {
        return res
          .status(400)
          .json({ error: "Invalid interval or day provided." });
      }

      // 3. Update the room settings
      const result = await pool.query(
        `UPDATE rooms SET meeting_interval = $1, meeting_day = $2 WHERE id = $3 RETURNING *`,
        [interval, day, roomId]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("SET SCHEDULE PREF ERROR:", err);
      res.status(500).json({ error: "Failed to save schedule preferences." });
    }
  }
);

module.exports = router;
