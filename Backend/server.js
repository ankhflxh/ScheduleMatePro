const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cron = require("node-cron"); // 1. Import cron
const pool = require("./db"); // Import DB pool
const sgMail = require("@sendgrid/mail"); // Import SendGrid
require("dotenv").config();

const { router: authRoutes } = require("./Routes/auth");
const roomRoutes = require("./Routes/rooms");
const availabilityRoutes = require("./Routes/availability");
const meetingRoutes = require("./Routes/meetings");

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// middleware
app.use(
  cors({
    origin: process.env.APP_BASE_URL,
    credentials: true,
  })
);
app.use(express.json());

// serve the whole Frontend folder
app.use(express.static(path.join(__dirname, "..", "Frontend")));
app.use(cookieParser());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/users", authRoutes);

// Landing page (root)
app.get("/", (req, res) => {
  res.redirect("/LandingPage/index.html");
});

// ----------------------------------------------------------------
// ⏰ CRON JOB: Send Reminder Emails at 7:00 PM Every Day
// ----------------------------------------------------------------
cron.schedule("0 19 * * *", async () => {
  console.log("⏰ Running Daily Meeting Reminder Check...");

  // 1. Get "Tomorrow's" Day Name (e.g., "Wednesday")
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

  try {
    // 2. Find all meetings scheduled for Tomorrow
    // We join with 'rooms' to get the room name
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

    // 3. For each meeting, find members and send email
    for (const meeting of meetings) {
      const memberResult = await pool.query(
        `SELECT u.email, u.username 
         FROM room_members rm
         JOIN users u ON rm.user_id = u.id
         WHERE rm.room_id = $1`,
        [meeting.room_id]
      );

      const members = memberResult.rows;
      const cleanTime = meeting.start_time.substring(0, 5); // Remove seconds

      // Send emails in parallel
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
        return sgMail.send(msg).catch((err) =>
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
  // Optional: Auto-open browser
  const open = (await import("open")).default;
  await open(`http://localhost:${PORT}/`);
});