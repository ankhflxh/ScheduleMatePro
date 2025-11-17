const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./Routes/auth");
const roomRoutes = require("./Routes/rooms");
const availabilityRoutes = require("./Routes/availability");
const meetingRoutes = require("./Routes/meetings");

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// Explicitly set MIME type for JSON files

// serve the whole Frontend folder
app.use(express.static(path.join(__dirname, "..", "Frontend")));

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
