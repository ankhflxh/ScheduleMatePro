// File: Backend/Routes/rooms.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const crypto = require("crypto");
const { authenticateToken } = require("./auth");
const sgMail = require("@sendgrid/mail"); // Import SendGrid
require("dotenv").config();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// GET /api/rooms/me - Get rooms the current user is in
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT r.* FROM rooms r
       JOIN room_members rm ON r.id = rm.room_id
       WHERE rm.user_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// GET /api/rooms/:roomId - Get single room details
router.get("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query("SELECT * FROM rooms WHERE id = $1", [
      roomId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch room details" });
  }
});

// POST /api/rooms - Create a new room
router.post("/", authenticateToken, async (req, res) => {
  const { name } = req.body;
  const creatorId = req.user.id;
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();

  try {
    // 1. Create Room
    const roomResult = await pool.query(
      "INSERT INTO rooms (name, code, creator_id) VALUES ($1, $2, $3) RETURNING *",
      [name, code, creatorId]
    );
    const room = roomResult.rows[0];

    // 2. Add Creator as Member
    await pool.query(
      "INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)",
      [room.id, creatorId]
    );

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// POST /api/rooms/join - Join a room via code
router.post("/join", authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.user.id;

  try {
    const roomResult = await pool.query("SELECT * FROM rooms WHERE code = $1", [
      inviteCode,
    ]);
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid invite code" });
    }
    const room = roomResult.rows[0];

    // Check if already member
    const memberCheck = await pool.query(
      "SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2",
      [room.id, userId]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: "You are already in this room" });
    }

    await pool.query(
      "INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)",
      [room.id, userId]
    );

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to join room" });
  }
});

// DELETE /api/rooms/:roomId/leave - Leave or Delete room
router.delete("/:roomId/leave", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const roomRes = await pool.query("SELECT * FROM rooms WHERE id = $1", [
      roomId,
    ]);
    if (roomRes.rows.length === 0)
      return res.status(404).json({ error: "Room not found" });

    const room = roomRes.rows[0];

    if (String(room.creator_id) === String(userId)) {
      // Creator is deleting the room -> Delete everything
      await pool.query("DELETE FROM availability WHERE room_id = $1", [roomId]);
      await pool.query("DELETE FROM room_members WHERE room_id = $1", [roomId]);
      await pool.query("DELETE FROM meetings WHERE room_id = $1", [roomId]); // cleanup meetings
      await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]);
      return res.json({ message: "Room deleted" });
    } else {
      // Member is leaving
      await pool.query(
        "DELETE FROM room_members WHERE room_id = $1 AND user_id = $2",
        [roomId, userId]
      );
      // Optional: Cleanup their availability
      await pool.query(
        "DELETE FROM availability WHERE room_id = $1 AND user_id = $2",
        [roomId, userId]
      );
      return res.json({ message: "Left room" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to leave room" });
  }
});

// ------------------------------------------------------------------
// PATCH /api/rooms/:roomId/schedule-preference (UPDATED WITH EMAIL)
// ------------------------------------------------------------------
router.patch(
  "/:roomId/schedule-preference",
  authenticateToken,
  async (req, res) => {
    const { roomId } = req.params;
    const { interval, day } = req.body;
    const userId = req.user.id;

    try {
      // 1. Verify User is Creator
      const roomCheck = await pool.query("SELECT * FROM rooms WHERE id = $1", [
        roomId,
      ]);
      if (roomCheck.rows.length === 0) {
        return res.status(404).json({ error: "Room not found" });
      }

      const room = roomCheck.rows[0];
      if (String(room.creator_id) !== String(userId)) {
        return res
          .status(403)
          .json({ error: "Only creator can set preferences." });
      }

      // 2. Update Preferences
      await pool.query(
        `UPDATE rooms
         SET meeting_interval = $1, meeting_day = $2
         WHERE id = $3`,
        [interval, day, roomId]
      );

      // 3. SEND EMAIL NOTIFICATION TO MEMBERS
      // Find all members EXCEPT the creator (who is making the change)
      const memberResult = await pool.query(
        `SELECT u.email, u.username
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.room_id = $1 AND u.id != $2`,
        [roomId, userId]
      );

      const members = memberResult.rows;

      if (members.length > 0) {
        const emailPromises = members.map((member) => {
          const msg = {
            to: member.email,
            from: process.env.EMAIL_USER, // Ensure this is set in .env
            subject: `Update: Meeting Details for "${room.name}" Changed`,
            text: `Hello ${member.username},\n\nThe meeting day for "${room.name}" has been changed to ${day}. Please log in and update your availability.\n\nBest,\nScheduleMate Team`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h3>Meeting Update</h3>
                <p>Hello <strong>${member.username}</strong>,</p>
                <p>The meeting day for <strong>${room.name}</strong> has been updated to <strong style="color: #6366f1;">${day}</strong>.</p>
                <p>Please log in and update your availability to match the new schedule.</p>
                <br>
                <a href="${process.env.APP_BASE_URL}" style="background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
              </div>
            `,
          };
          return sgMail.send(msg).catch((err) => {
            console.error(`Failed to send email to ${member.email}`, err);
          });
        });

        // Send all emails in parallel (non-blocking)
        Promise.all(emailPromises);
      }

      res.json({ message: "Preferences updated and members notified." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update preferences." });
    }
  }
);

module.exports = router;
