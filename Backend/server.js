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

// ✅ Shared push helper
const { webpush, sendPushToRoomMembers } = require("./pushHelper");

const app = express();
const PORT = process.env.PORT || 5000;

// Resend — kept strictly for auth verification emails
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(
  cors({
    origin: process.env.APP_BASE_URL,
    credentials: true,
  }),
);
app.use(express.json());
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

// ----------------------------------------------------------------
// HELPER: Get Consistent System Time
// ----------------------------------------------------------------
function getSystemTime() {
  const now = new Date();
  const currentDay = now.toLocaleDateString("en-US", { weekday: "long" });
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${hours}:${minutes}:00`;
  return { now, currentDay, currentTime };
}

// ----------------------------------------------------------------
// HELPER: Get a time string X minutes from now (HH:MM:00)
// ----------------------------------------------------------------
function getTimeOffsetMinutes(minutesFromNow) {
  const future = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const h = String(future.getHours()).padStart(2, "0");
  const m = String(future.getMinutes()).padStart(2, "0");
  return `${h}:${m}:00`;
}

// ----------------------------------------------------------------
// ⏰ CRON JOB 1: Push when meeting starts (Every Minute)
// ✅ Email removed — push only
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

    for (const meeting of meetingsResult.rows) {
      // Mark as sent so it doesn't fire again
      await pool.query(
        "UPDATE meetings SET started_email_sent = TRUE WHERE id = $1",
        [meeting.id],
      );

      await sendPushToRoomMembers(meeting.room_id, {
        title: "🚀 Meeting Starting Now!",
        body: `"${meeting.room_name}" is happening now — ${meeting.location}`,
        url: `/Rooms/MeetingBoard/board.html`,
      });

      console.log(`✅ Sent start push for meeting ${meeting.id}`);
    }
  } catch (err) {
    console.error("❌ Meeting Started Cron Error:", err);
  }
});

// ----------------------------------------------------------------
// ⏰ CRON JOB 2: Push 30 minutes before meeting
// ----------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  const { currentDay } = getSystemTime();
  const targetTime = getTimeOffsetMinutes(30);

  try {
    const result = await pool.query(
      `SELECT m.id, m.room_id, m.start_time, m.location, r.name as room_name
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.meeting_day = $1
         AND m.start_time = $2
         AND m.reminder_30_sent = FALSE`,
      [currentDay, targetTime],
    );

    for (const meeting of result.rows) {
      await pool.query(
        "UPDATE meetings SET reminder_30_sent = TRUE WHERE id = $1",
        [meeting.id],
      );

      await sendPushToRoomMembers(meeting.room_id, {
        title: "⏰ Meeting in 30 Minutes",
        body: `"${meeting.room_name}" starts at ${meeting.start_time.substring(0, 5)} — ${meeting.location}`,
        url: `/Rooms/MeetingBoard/board.html`,
      });

      console.log(`✅ Sent 30-min push for meeting ${meeting.id}`);
    }
  } catch (err) {
    console.error("❌ 30-min Push Cron Error:", err);
  }
});

// ----------------------------------------------------------------
// ⏰ CRON JOB 3: Push 5 minutes before meeting
// ----------------------------------------------------------------
cron.schedule("* * * * *", async () => {
  const { currentDay } = getSystemTime();
  const targetTime = getTimeOffsetMinutes(5);

  try {
    const result = await pool.query(
      `SELECT m.id, m.room_id, m.start_time, m.location, r.name as room_name
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.meeting_day = $1
         AND m.start_time = $2
         AND m.reminder_5_sent = FALSE`,
      [currentDay, targetTime],
    );

    for (const meeting of result.rows) {
      await pool.query(
        "UPDATE meetings SET reminder_5_sent = TRUE WHERE id = $1",
        [meeting.id],
      );

      await sendPushToRoomMembers(meeting.room_id, {
        title: "🚨 Meeting Starting Soon",
        body: `"${meeting.room_name}" starts in 5 minutes — ${meeting.location}`,
        url: `/Rooms/MeetingBoard/board.html`,
      });

      console.log(`✅ Sent 5-min push for meeting ${meeting.id}`);
    }
  } catch (err) {
    console.error("❌ 5-min Push Cron Error:", err);
  }
});

// ----------------------------------------------------------------
// 🔔 PUSH SUBSCRIPTION ROUTES
// ----------------------------------------------------------------

// 1. Save subscription when user clicks "Allow"
app.post("/api/notifications/subscribe", async (req, res) => {
  try {
    const { subscription, userId } = req.body;

    if (!subscription || !userId) {
      return res
        .status(400)
        .json({ error: "Missing subscription or user ID." });
    }

    const result = await pool.query(
      `UPDATE users SET push_subscription = $1 WHERE id = $2 RETURNING id, username;`,
      [subscription, userId],
    );

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

// 2. Check if a subscription endpoint is saved for a specific user
app.post("/api/notifications/check-subscription", async (req, res) => {
  try {
    const { endpoint, userId } = req.body;

    if (!endpoint || !userId) {
      return res.status(400).json({ subscribed: false });
    }

    const result = await pool.query(
      "SELECT push_subscription FROM users WHERE id = $1 AND push_subscription IS NOT NULL",
      [userId],
    );

    if (result.rowCount === 0) {
      return res.json({ subscribed: false });
    }

    const stored = result.rows[0].push_subscription;
    const storedEndpoint =
      typeof stored === "string"
        ? JSON.parse(stored).endpoint
        : stored.endpoint;

    res.json({ subscribed: storedEndpoint === endpoint });
  } catch (error) {
    console.error("Check subscription error:", error);
    res.status(500).json({ subscribed: false });
  }
});

// 3. Manually trigger a push reminder (utility route)
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

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "ScheduleMate Pro Reminder",
        body: `Your meeting "${meetingTitle}" is starting soon!`,
        url: `/Dashboard/dashboard.html`,
      }),
    );

    res.status(200).json({ message: "Reminder sent successfully!" });
  } catch (error) {
    console.error("Error sending push notification:", error);
    res.status(500).json({ error: "Failed to send notification." });
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
