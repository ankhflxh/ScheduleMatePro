// File: Backend/Routes/availability.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const { webpush } = require("../pushHelper");

// GET /api/availability/:roomId
router.get("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT a.*, u.username
       FROM availability a
       JOIN users u ON a.user_id = u.id
       WHERE a.room_id = $1`,
      [roomId],
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
      `SELECT * FROM availability WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
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

// POST /api/availability/:roomId — Submit or update availability
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { day, start_time, location } = req.body;
  const userId = req.user.id;

  if (!day || !start_time) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1. Fetch Room details (interval + creator)
    const roomRes = await pool.query(
      "SELECT meeting_interval, creator_id, name FROM rooms WHERE id = $1",
      [roomId],
    );

    if (roomRes.rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    const { meeting_interval, creator_id, name: roomName } = roomRes.rows[0];
    const interval = parseInt(meeting_interval) || 1;

    // 2. Calculate End Time server-side
    const [startH, startM] = start_time.split(":").map(Number);
    let endH = startH + interval;
    if (endH >= 24) endH -= 24;

    const end_time = `${String(endH).padStart(2, "0")}:${String(
      startM,
    ).padStart(2, "0")}`;

    // 3. Upsert availability (update if exists, insert if not)
    const update = await pool.query(
      `UPDATE availability
       SET day = $1, start_time = $2, end_time = $3, location = $4, updated_at = CURRENT_TIMESTAMP
       WHERE room_id = $5 AND user_id = $6
       RETURNING *`,
      [day, start_time, end_time, location, roomId, userId],
    );

    let savedRow;
    let isEdit = false;

    if (update.rows.length > 0) {
      savedRow = update.rows[0];
      isEdit = true;
    } else {
      const insert = await pool.query(
        `INSERT INTO availability (room_id, user_id, day, start_time, end_time, location)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [roomId, userId, day, start_time, end_time, location],
      );
      savedRow = insert.rows[0];
    }

    // 4. ✅ Notify creator only — but NOT if the creator is the one submitting
    if (String(userId) !== String(creator_id)) {
      try {
        // Get creator's push subscription and username of the submitter
        const creatorRes = await pool.query(
          "SELECT push_subscription FROM users WHERE id = $1 AND push_subscription IS NOT NULL",
          [creator_id],
        );

        const submitterRes = await pool.query(
          "SELECT username FROM users WHERE id = $1",
          [userId],
        );

        const submitterName = submitterRes.rows[0]?.username || "A member";

        if (creatorRes.rows.length > 0) {
          const { push_subscription } = creatorRes.rows[0];
          const action = isEdit ? "updated their" : "submitted their";

          await webpush.sendNotification(
            push_subscription,
            JSON.stringify({
              title: "📋 Availability Update",
              body: `${submitterName} ${action} availability in "${roomName}"`,
              url: `/Rooms/Availability/availability.html`,
            }),
          );
        }
      } catch (pushErr) {
        // Don't fail the request if push fails
        console.error("❌ Push to creator failed:", pushErr.message);
      }
    }

    res.json(savedRow);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to save availability" });
  }
});

module.exports = router;
