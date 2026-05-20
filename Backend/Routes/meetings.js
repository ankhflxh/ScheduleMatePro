// File: Backend/Routes/meetings.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");

// ✅ Push only — Resend removed entirely from this file
const { sendPushToRoomMembers } = require("../pushHelper");

// GET /api/meetings/me - Get meetings for the logged-in user
router.get("/me", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT m.*, r.name AS room_name, u.username AS confirmed_by_username
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       JOIN room_members rm ON rm.room_id = r.id
       JOIN users u ON m.confirmed_by = u.id
       WHERE rm.user_id = $1
       ORDER BY m.created_at DESC`,
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load meetings" });
  }
});

// GET /api/meetings/history/:roomId - Get ALL meetings for a room
router.get("/history/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, meeting_day, start_time, end_time, location, daily_room_url, created_at
       FROM meetings
       WHERE room_id = $1
       ORDER BY created_at DESC`,
      [roomId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ error: "Failed to fetch meeting history" });
  }
});

// POST /api/meetings/:roomId - Confirm a meeting
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const { meeting_day, start_time, location } = req.body;
  const confirmed_by = req.user.id;

  try {
    // 1. Fetch Room Details
    const roomCheck = await pool.query(
      "SELECT creator_id, name, meeting_interval FROM rooms WHERE id = $1",
      [roomId],
    );

    if (roomCheck.rows.length === 0)
      return res.status(404).json({ error: "Room not found." });

    const room = roomCheck.rows[0];

    // 2. Security Check: Only Creator can confirm
    if (String(room.creator_id) !== String(confirmed_by)) {
      return res.status(403).json({ error: "Only creator can confirm." });
    }

    // 3. Calculate End Time Server-Side
    const intervalHours = parseInt(room.meeting_interval) || 1;
    const [startH, startM] = start_time.split(":").map(Number);
    let endH = startH + intervalHours;
    if (endH >= 24) endH -= 24;
    const end_time = `${String(endH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;

    // 4. Create Daily.co room (available only on meeting day)
    let daily_room_url = null;
    let daily_room_name = null;

    try {
      const DAILY_API_KEY = process.env.DAILY_API_KEY;
      if (DAILY_API_KEY) {
        // Work out the next occurrence of meeting_day as a real date
        const DAY_NAMES = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const today = new Date();
        const targetIdx = DAY_NAMES.indexOf(meeting_day);
        const todayIdx = today.getDay();
        let diff = targetIdx - todayIdx;
        if (diff < 0) diff += 7;
        const meetingDate = new Date(today);
        meetingDate.setDate(today.getDate() + diff);

        // nbf = meeting start time on that day (unix seconds)
        const [nbfH, nbfM] = start_time.split(":").map(Number);
        meetingDate.setHours(nbfH, nbfM, 0, 0);
        const nbf = Math.floor(meetingDate.getTime() / 1000);

        // exp = meeting end time + 30 min buffer
        const expDate = new Date(meetingDate);
        expDate.setHours(endH, startM, 0, 0);
        expDate.setMinutes(expDate.getMinutes() + 30);
        const exp = Math.floor(expDate.getTime() / 1000);

        const roomSlug = `schedulemate-${roomId}-${Date.now()}`;

        const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DAILY_API_KEY}`,
          },
          body: JSON.stringify({
            name: roomSlug,
            properties: {
              nbf,
              exp,
              eject_at_room_exp: true,
              enable_chat: true,
              enable_knocking: false,
            },
          }),
        });

        const dailyData = await dailyRes.json();
        if (dailyRes.ok && dailyData.url) {
          daily_room_url = dailyData.url;
          daily_room_name = roomSlug;
        } else {
          console.error("Daily.co room creation failed:", dailyData);
        }
      }
    } catch (dailyErr) {
      console.error("Daily.co error:", dailyErr.message);
      // Don't fail the meeting confirmation if Daily fails
    }

    // 5. Insert Meeting
    const result = await pool.query(
      `INSERT INTO meetings (room_id, confirmed_by, meeting_day, start_time, end_time, location, daily_room_url, daily_room_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        roomId,
        confirmed_by,
        meeting_day,
        start_time,
        end_time,
        location,
        daily_room_url,
        daily_room_name,
      ],
    );

    const newMeeting = result.rows[0];

    // 4. Clear availability so members can submit fresh for the next meeting
    await pool.query(`DELETE FROM availability WHERE room_id = $1`, [roomId]);

    // 5. ✅ Push notification only — no email
    await sendPushToRoomMembers(roomId, {
      title: "✅ Meeting Confirmed!",
      body: `"${room.name}" is set for ${meeting_day} at ${start_time} — ${location}`,
      url: `/Rooms/MeetingBoard/board.html`,
    });

    res.json(newMeeting);
  } catch (err) {
    console.error("Meeting Confirm Error:", err);
    res.status(400).json({ error: "Failed to confirm meeting" });
  }
});

// GET /api/meetings/confirmed
router.get("/confirmed", authenticateToken, async (req, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: "Room ID required" });
  try {
    const result = await pool.query(
      `SELECT meeting_day AS day, start_time AS time, location
       FROM meetings WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [roomId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No confirmed meeting" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Fetch error" });
  }
});

// DELETE /api/meetings/:meetingId - Creator cancels a confirmed meeting
router.delete("/:meetingId", authenticateToken, async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;

  try {
    // 1. Fetch the meeting and verify it exists
    const meetingRes = await pool.query(
      `SELECT m.*, r.name AS room_name, r.creator_id
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.id = $1`,
      [meetingId],
    );

    if (meetingRes.rows.length === 0)
      return res.status(404).json({ error: "Meeting not found." });

    const meeting = meetingRes.rows[0];

    // 2. Only the room creator can delete
    if (String(meeting.creator_id) !== String(userId))
      return res
        .status(403)
        .json({ error: "Only the room creator can cancel a meeting." });

    // 3. Delete the Daily.co room if it exists
    if (meeting.daily_room_name && process.env.DAILY_API_KEY) {
      try {
        await fetch(
          `https://api.daily.co/v1/rooms/${meeting.daily_room_name}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
          },
        );
      } catch (e) {
        console.error("Failed to delete Daily.co room:", e.message);
      }
    }

    // 4. Delete the meeting
    await pool.query("DELETE FROM meetings WHERE id = $1", [meetingId]);

    // 4. Push notification to all room members
    await sendPushToRoomMembers(meeting.room_id, {
      title: "❌ Meeting Cancelled",
      body: `The meeting in "${meeting.room_name}" on ${meeting.meeting_day} at ${meeting.start_time} has been cancelled.`,
      url: `/Rooms/MeetingBoard/board.html`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete meeting error:", err);
    res.status(500).json({ error: "Failed to cancel meeting." });
  }
});

module.exports = router;
