// File: Backend/server.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cron = require("node-cron");
const pool = require("./db");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

const { router: authRoutes } = require("./Routes/auth");
const roomRoutes = require("./Routes/rooms");
const availabilityRoutes = require("./Routes/availability");
const meetingRoutes = require("./Routes/meetings");
const notesRoutes = require("./Routes/notes");

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Middleware
app.use(
  cors({
    origin: process.env.APP_BASE_URL,
    credentials: true,
  })
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
    // Find meetings that: Match Today, Have Started, Email NOT sent yet
    const meetingsResult = await pool.query(
      `SELECT m.id, m.room_id, m.start_time, m.location, r.name as room_name 
       FROM meetings m
       JOIN rooms r ON m.room_id = r.id
       WHERE m.meeting_day = $1
         AND m.started_email_sent = FALSE
         AND m.start_time <= $2
         AND m.end_time > $2`,
      [currentDay, currentTime]
    );

    const meetings = meetingsResult.rows;

    if (meetings.length > 0) {
      console.log(
        `🚀 Sending "Started" emails for ${meetings.length} meetings.`
      );

      for (const meeting of meetings) {
        // A. Mark as sent FIRST (prevent double-send race conditions)
        await pool.query(
          "UPDATE meetings SET started_email_sent = TRUE WHERE id = $1",
          [meeting.id]
        );

        // B. Fetch Members
        const memberResult = await pool.query(
          `SELECT u.email, u.username 
           FROM room_members rm
           JOIN users u ON rm.user_id = u.id
           WHERE rm.room_id = $1`,
          [meeting.room_id]
        );

        const members = memberResult.rows;
        const cleanTime = meeting.start_time.substring(0, 5);

        // C. Send Emails
        const emailPromises = members.map((member) => {
          const msg = {
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
          };
          return sgMail
            .send(msg)
            .catch((err) =>
              console.error(`Failed to email ${member.email}:`, err)
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
      [tomorrowDay]
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
        [meeting.room_id]
      );

      const members = memberResult.rows;
      const cleanTime = meeting.start_time.substring(0, 5);

      const emailPromises = members.map((member) => {
        const msg = {
          to: member.email,
          from: process.env.EMAIL_USER,
          subject: `Reminder: Meeting Tomorrow for "${meeting.room_name}"`,
          text: `Hello ${member.username},\n\nJust a reminder that you have a meeting tomorrow!\n\nRoom: ${meeting.room_name}\nTime: ${cleanTime}\nLocation: ${meeting.location}\n\nSee you there!`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
              <h3 style="color: #6366f1;">📅 Meeting Reminder</h3>
              <p>Hello <strong>${member.username}</strong>,</p>
              <p>Don't forget, you have a meeting coming up tomorrow:</p>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                <p><strong>Room:</strong> ${meeting.room_name}</p>
                <p><strong>Time:</strong> ${cleanTime}</p>
                <p><strong>Location:</strong> ${meeting.location}</p>
              </div>
            </div>
          `,
        };
        return sgMail
          .send(msg)
          .catch((err) =>
            console.error(`Failed to email ${member.email}:`, err)
          );
      });

      await Promise.all(emailPromises);
    }
    console.log(`✅ Sent reminders for ${meetings.length} meetings.`);
  } catch (err) {
    console.error("❌ Reminder Cron Error:", err);
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
