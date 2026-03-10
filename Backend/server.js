// File: Backend/server.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cron = require("node-cron");
const pool = require("./db");
const { Resend } = require("resend");
require("dotenv").config();

const { router: authRoutes } = require("./Routes/auth");
const roomRoutes = require("./Routes/rooms");
const availabilityRoutes = require("./Routes/availability");
const meetingRoutes = require("./Routes/meetings");
const notesRoutes = require("./Routes/notes");
const webpush = require("web-push");

// 1. Sanitize the keys (Removes invisible spaces, newlines, or accidental quotes)
const cleanPublicKey = process.env.VAPID_PUBLIC_KEY
  ? process.env.VAPID_PUBLIC_KEY.replace(/['"]/g, "").trim()
  : "";
const cleanPrivateKey = process.env.VAPID_PRIVATE_KEY
  ? process.env.VAPID_PRIVATE_KEY.replace(/['"]/g, "").trim()
  : "";

// 2. Configure Web Push with the cleaned keys
webpush.setVapidDetails(process.env.mailto, cleanPublicKey, cleanPrivateKey);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize SendGrid / Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(
  cors({
    origin: process.env.APP_BASE_URL,
    credentials: true,
  }),
);
app.use(express.json());

// Serve Frontend
app.use(express.static(path.join(__dirname, "..", "Frontend")));
app.use(cookieParser());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/users", authRoutes);

// Root Redirect
app.get("/", (req, res) => {
  res.redirect("/LandingPage/index.html");
});

// --- HELPER: Get Consistent System Time ---
function getSystemTime() {
  const now = new Date();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hours}:${minutes}:00`;
  return { now, currentDay, currentTime };
}

// ----------------------------------------------------------------
// ⏰ CRON JOB 1: Send "Meeting Started" Emails (Runs Every Minute)
// ----------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  const { currentDay, currentTime } = getSystemTime();

  try {
    const meetingsResult = await pool.query(
      `SELECT m.id, m.room_id, m.start_time, m.location, r.name as room_name 
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.meeting_day = $1
         AND m.started_email_sent = FALSE
         AND m.start_time <= $2
         AND m.end_time > $2`,
      [currentDay, currentTime],
    );

    const meetings = meetingsResult.rows;

    if (meetings.length > 0) {
      console.log(
        `🚀 Sending "Started" emails for ${meetings.length} meetings.`,
      );

      for (const meeting of meetings) {
        await pool.query(
          "UPDATE meetings SET started_email_sent = TRUE WHERE id = $1",
          [meeting.id],
        );

        const memberResult = await pool.query(
          `SELECT u.email, u.username 
           FROM room_members rm
           JOIN users u ON rm.user_id = u.id
           WHERE rm.room_id = $1`,
          [meeting.room_id],
        );

        const members = memberResult.rows;
        const cleanTime = meeting.start_time.substring(0, 5);

        const emailPromises = members.map((member) => {
          return resend.emails
            .send({
              to: member.email,
              from: process.env.EMAIL_USER,
              subject: `Happening Now: Meeting in "${meeting.room_name}"`,
              text: `Hello ${member.username},\n\nThe meeting for "${meeting.room_name}" has started!\n\nTime: ${cleanTime}\nLocation: ${meeting.location}\n\nHop in!`,
              html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #10b981;">🚀 Meeting Started!</h2>
                <p>Hello <strong>${member.username}</strong>,</p>
                <p>The meeting for <strong>${meeting.room_name}</strong> is happening right now.</p>
                <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; border-left: 5px solid #10b981;">
                  <p><strong>⏰ Time:</strong> ${cleanTime}</p>
                  <p><strong>📍 Location:</strong> ${meeting.location}</p>
                </div>
                <p>See you there!</p>
              </div>
            `,
            })
            .catch((err) =>
              console.error(`Failed to email ${member.email}:`, err),
            );
        });

        await Promise.all(emailPromises);
      }
    }
  } catch (err) {
    console.error("❌ In-Progress Cron Error:", err);
  }
});

// ----------------------------------------------------------------
// ⏰ CRON JOB 2: Send Reminder Emails at 7:00 PM Every Day
// ----------------------------------------------------------------
cron.schedule("0 19 * * *", async () => {
  console.log("⏰ Running Daily Meeting Reminder Check...");

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

  try {
    const meetingsResult = await pool.query(
      `SELECT m.id, m.room_id, m.start_time, m.location, r.name as room_name 
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.meeting_day = $1`,
      [tomorrowDay],
    );

    const meetings = meetingsResult.rows;

    if (meetings.length === 0) {
      console.log(`No meetings found for tomorrow (${tomorrowDay}).`);
      return;
    }

    for (const meeting of meetings) {
      const memberResult = await pool.query(
        `SELECT u.email, u.username 
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.room_id = $1`,
        [meeting.room_id],
      );

      const members = memberResult.rows;
      const cleanTime = meeting.start_time.substring(0, 5);

      const emailPromises = members.map((member) => {
        return resend.emails
          .send({
            to: member.email,
            from: process.env.EMAIL_USER,
            subject: `Reminder: Meeting in "${meeting.room_name}" tomorrow!`,
            text: `Hello ${member.username},\n\nReminder for "${meeting.room_name}" tomorrow!\n\nTime: ${cleanTime}\nLocation: ${meeting.location}\n\nSee you there!`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #10b981;">📅 Meeting Tomorrow!</h2>
                <p>Hello <strong>${member.username}</strong>,</p>
                <p>Don't forget about your meeting for <strong>${meeting.room_name}</strong> tomorrow.</p>
                <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; border-left: 5px solid #10b981;">
                  <p><strong>⏰ Time:</strong> ${cleanTime}</p>
                  <p><strong>📍 Location:</strong> ${meeting.location}</p>
                </div>
              </div>
            `,
          })
          .catch((err) =>
            console.error(`Failed to email ${member.email}:`, err),
          );
      });

      await Promise.all(emailPromises);
    }
    console.log(`✅ Sent reminders for ${meetings.length} meetings.`);
  } catch (err) {
    console.error("❌ Reminder Cron Error:", err);
  }
});

// --- PRODUCTION PUSH NOTIFICATION ROUTES ---

// 1. SAVE THE SUBSCRIPTION (When the user clicks "Allow")
app.post("/api/notifications/subscribe", async (req, res) => {
  try {
    const { subscription, userId } = req.body;

    if (!subscription || !userId) {
      return res
        .status(400)
        .json({ error: "Missing subscription or user ID." });
    }

    const updateQuery = `
      UPDATE users 
      SET push_subscription = $1 
      WHERE id = $2 
      RETURNING id, username;
    `;

    const result = await pool.query(updateQuery, [subscription, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found in database." });
    }

    res
      .status(201)
      .json({ message: "Subscription saved securely to database!" });
  } catch (error) {
    console.error("Database error saving subscription:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// 2. SEND A REMINDER (You will trigger this when a meeting is about to start)
app.post("/api/notifications/send-reminder", async (req, res) => {
  try {
    const { userId, meetingTitle } = req.body;

    const userQuery = await pool.query(
      "SELECT push_subscription FROM users WHERE id = $1",
      [userId],
    );

    if (userQuery.rowCount === 0 || !userQuery.rows[0].push_subscription) {
      return res
        .status(404)
        .json({ error: "User does not have an active push subscription." });
    }

    const subscription = userQuery.rows[0].push_subscription;

    const payload = JSON.stringify({
      title: "ScheduleMate Pro Reminder",
      body: `Your meeting "${meetingTitle}" is starting soon!`,
    });

    await webpush.sendNotification(subscription, payload);

    res.status(200).json({ message: "Reminder sent successfully!" });
  } catch (error) {
    console.error("Error sending push notification:", error);
    res.status(500).json({ error: "Failed to send notification." });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
