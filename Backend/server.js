const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { router: authRoutes } = require("./Routes/auth");
const roomRoutes = require("./Routes/rooms");
const availabilityRoutes = require("./Routes/availability");
const meetingRoutes = require("./Routes/meetings");

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: process.env.APP_BASE_URL, // Use your APP_BASE_URL or "http://localhost:port"
    credentials: true, // Allow cookies to be sent with requests
  })
);
app.use(express.json());

// Explicitly set MIME type for JSON files

// serve the whole Frontend folder
app.use(express.static(path.join(__dirname, "..", "Frontend")));
app.use(cookieParser());
// API routes
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/users", authRoutes);
app.use("/api", authRoutes);
// landing page (root)
app.get("/", (req, res) => {
  res.redirect("/LandingPage/index.html");
});

app.listen(PORT, async () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
  const open = (await import("open")).default;
  await open(`http://localhost:${PORT}/`);
});
