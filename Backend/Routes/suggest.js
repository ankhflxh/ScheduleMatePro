// File: Backend/Routes/suggest.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ---------------------------------------------------------------
// Rate limit: max 1 suggestion request per room every 60 seconds
// Prevents accidental API abuse (e.g. button spamming)
// ---------------------------------------------------------------
const lastRequestTime = new Map();
const RATE_LIMIT_MS = 60 * 1000;

// ---------------------------------------------------------------
// POST /api/suggest/:roomId
// Only the room creator can request a suggestion
// ---------------------------------------------------------------
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  // 1. Rate limit check
  const lastTime = lastRequestTime.get(roomId);
  if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
    const secondsLeft = Math.ceil(
      (RATE_LIMIT_MS - (Date.now() - lastTime)) / 1000,
    );
    return res.status(429).json({
      error: `Please wait ${secondsLeft} seconds before requesting another suggestion.`,
    });
  }

  try {
    // 2. Verify user is the room creator
    const roomRes = await pool.query(
      "SELECT creator_id, name, meeting_interval FROM rooms WHERE id = $1",
      [roomId],
    );

    if (roomRes.rows.length === 0) {
      return res.status(404).json({ error: "Room not found." });
    }

    const room = roomRes.rows[0];

    if (String(room.creator_id) !== String(userId)) {
      return res
        .status(403)
        .json({ error: "Only the room creator can request a suggestion." });
    }

    // 3. Fetch all members' availability for this room
    const availRes = await pool.query(
      `SELECT a.day, a.start_time, a.end_time, a.location, u.username
       FROM availability a
       JOIN users u ON a.user_id = u.id
       WHERE a.room_id = $1`,
      [roomId],
    );

    if (availRes.rows.length === 0) {
      return res.status(400).json({
        error:
          "No availability has been submitted yet. Ask your members to submit their availability first.",
      });
    }

    // 4. Get total room member count for context
    const memberCountRes = await pool.query(
      "SELECT COUNT(*) FROM room_members WHERE room_id = $1",
      [roomId],
    );
    const totalMembers = parseInt(memberCountRes.rows[0].count);
    const submittedCount = availRes.rows.length;

    // 5. Format availability data for the prompt
    const availabilityText = availRes.rows
      .map(
        (a) =>
          `- ${a.username}: ${a.day} from ${a.start_time.substring(0, 5)} to ${a.end_time.substring(0, 5)}${a.location ? ` (prefers: ${a.location})` : ""}`,
      )
      .join("\n");

    // 6. Build the Gemini prompt
    const prompt = `You are a smart scheduling assistant for a university student group called "${room.name}".

The meeting duration is ${room.meeting_interval} hour(s).

${submittedCount} out of ${totalMembers} members have submitted their availability:
${availabilityText}

Your task:
1. Find the single best meeting time that works for the most members.
2. If multiple slots work for everyone, prefer the earliest one.
3. Explain your reasoning clearly in plain English, mentioning how many members are covered and any trade-offs.

Respond ONLY with a valid JSON object in this exact format, no markdown, no extra text:
{
  "suggested_day": "Monday",
  "suggested_start_time": "14:00",
  "suggested_end_time": "15:00",
  "members_covered": 4,
  "total_members": 5,
  "preferred_location": "Library",
  "reasoning": "Your plain English explanation here."
}`;

    // 7. Call Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(prompt);
    const rawText = result.response.text().trim();

    // 8. Parse JSON response safely
    let suggestion;
    try {
      // Strip markdown code fences if Gemini adds them
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      suggestion = JSON.parse(cleaned);
    } catch {
      console.error("Gemini raw response:", rawText);
      return res.status(500).json({
        error: "The AI returned an unexpected response. Please try again.",
      });
    }

    // 9. Update rate limit timestamp
    lastRequestTime.set(roomId, Date.now());

    // 10. Return suggestion to frontend
    res.json({
      success: true,
      suggestion,
    });
  } catch (err) {
    console.error("Suggest Route Error:", err.message, err.status);
    res.status(500).json({ error: "Failed to generate suggestion." });
  }
});

module.exports = router;
