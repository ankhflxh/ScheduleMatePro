// File: Backend/Routes/meetings.js

const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
      [userId]
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
      `SELECT meeting_day, start_time, end_time, location, created_at
             FROM meetings
             WHERE room_id = $1
             ORDER BY created_at DESC`,
      [roomId]
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
  const { meeting_day, start_time, location } = req.body; // Note: We IGNORE end_time from body
  const confirmed_by = req.user.id;

  try {
    // 1. Fetch Room Details (Creator & Interval)
    const roomCheck = await pool.query(
      "SELECT creator_id, name, meeting_interval FROM rooms WHERE id = $1",
      [roomId]
    );

    if (roomCheck.rows.length === 0)
      return res.status(404).json({ error: "Room not found." });

    const room = roomCheck.rows[0];

    // 2. Security Check: Only Creator can confirm
    if (String(room.creator_id) !== String(confirmed_by)) {
      return res.status(403).json({ error: "Only creator can confirm." });
    }

    // 3. Calculate End Time Server-Side (Secure)
    const intervalHours = parseInt(room.meeting_interval) || 1;
    const [startH, startM] = start_time.split(":").map(Number);

    // Simple hour addition (handling 24h overflow generally handled by new Date logic if needed,
    // but here we keep it simple as string storage)
    let endH = startH + intervalHours;
    if (endH >= 24) endH -= 24; // Wrap around midnight if necessary

    const end_time = `${String(endH).padStart(2, "0")}:${String(
      startM
    ).padStart(2, "0")}`;

    // 4. Insert Meeting
    const result = await pool.query(
      `INSERT INTO meetings (room_id, confirmed_by, meeting_day, start_time, end_time, location)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [roomId, confirmed_by, meeting_day, start_time, end_time, location]
    );

    const newMeeting = result.rows[0];

    // 5. Send Email Notifications
    const memberResult = await pool.query(
      `SELECT u.email, u.username
       FROM room_members rm
       JOIN users u ON rm.user_id = u.id
       WHERE rm.room_id = $1`,
      [roomId]
    );

    const members = memberResult.rows;

    const emailPromises = members.map((member) => {
      const msg = {
        to: member.email,
        from: process.env.EMAIL_USER,
        subject: `Meeting Confirmed: "${room.name}"`,
        text: `Hello ${member.username},\n\nA new meeting has been confirmed!\n\nRoom: ${room.name}\nDay: ${meeting_day}\nTime: ${start_time} - ${end_time}\nLocation: ${location}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #10b981;">✅ Meeting Confirmed!</h2>
            <p>Hello <strong>${member.username}</strong>,</p>
            <p>A new meeting has been scheduled for <strong>${room.name}</strong>.</p>
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 5px solid #10b981;">
              <p><strong>📅 Day:</strong> ${meeting_day}</p>
              <p><strong>⏰ Time:</strong> ${start_time} - ${end_time}</p>
              <p><strong>📍 Location:</strong> ${location}</p>
            </div>
            <p>See you there!</p>
          </div>
        `,
      };
      // Send and catch individual errors so one bad email doesn't crash the loop
      return sgMail
        .send(msg)
        .catch((e) => console.error(`Failed to email ${member.email}:`, e));
    });

    // Run emails in background (don't await them to speed up response)
    Promise.all(emailPromises);

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
      [roomId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No confirmed meeting" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Fetch error" });
  }
});

module.exports = router;
