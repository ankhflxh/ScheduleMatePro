// File: Backend/Routes/suggest.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const Anthropic = require("@anthropic-ai/sdk");

const lastRequestTime = new Map();
const RATE_LIMIT_MS = 60 * 1000;

// ---------------------------------------------------------------
// POST /api/suggest/:roomId  — Generate AI suggestion (creator only)
// ---------------------------------------------------------------
router.post("/:roomId", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

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
    const roomRes = await pool.query(
      "SELECT creator_id, name, meeting_interval FROM rooms WHERE id = $1",
      [roomId],
    );

    if (roomRes.rows.length === 0)
      return res.status(404).json({ error: "Room not found." });

    const room = roomRes.rows[0];

    if (String(room.creator_id) !== String(userId))
      return res
        .status(403)
        .json({ error: "Only the room creator can request a suggestion." });

    const availRes = await pool.query(
      `SELECT a.day, a.start_time, a.end_time, a.location, u.username
       FROM availability a
       JOIN users u ON a.user_id = u.id
       WHERE a.room_id = $1`,
      [roomId],
    );

    if (availRes.rows.length === 0)
      return res.status(400).json({
        error:
          "No availability has been submitted yet. Ask your members to submit their availability first.",
      });

    const memberCountRes = await pool.query(
      "SELECT COUNT(*) FROM room_members WHERE room_id = $1",
      [roomId],
    );
    const totalMembers = parseInt(memberCountRes.rows[0].count);
    const submittedCount = availRes.rows.length;

    const availabilityText = availRes.rows
      .map(
        (a) =>
          `- ${a.username}: ${a.day} from ${a.start_time.substring(0, 5)} to ${a.end_time.substring(0, 5)}${a.location ? ` (prefers: ${a.location})` : ""}`,
      )
      .join("\n");

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0].text.trim();

    let suggestion;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      suggestion = JSON.parse(cleaned);
    } catch {
      console.error("Claude raw response:", rawText);
      return res.status(500).json({
        error: "The AI returned an unexpected response. Please try again.",
      });
    }

    lastRequestTime.set(roomId, Date.now());
    res.json({ success: true, suggestion });
  } catch (err) {
    console.error("Suggest Route Error:", err.message, err);
    res.status(500).json({ error: "Failed to generate suggestion." });
  }
});

// ---------------------------------------------------------------
// GET /api/suggest/:roomId/shared
// Any room member can fetch the currently shared suggestion
// ---------------------------------------------------------------
router.get("/:roomId/shared", authenticateToken, async (req, res) => {
  const { roomId } = req.params;

  try {
    const memberCheck = await pool.query(
      "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
      [roomId, req.user.id],
    );

    if (memberCheck.rows.length === 0)
      return res.status(403).json({ error: "Not a member of this room." });

    const result = await pool.query(
      "SELECT last_ai_suggestion FROM rooms WHERE id = $1",
      [roomId],
    );

    const suggestion = result.rows[0]?.last_ai_suggestion;
    if (!suggestion) return res.json({ suggestion: null });

    res.json({ suggestion });
  } catch (err) {
    console.error("Fetch Shared Suggestion Error:", err.message, err);
    res.status(500).json({ error: "Failed to fetch suggestion." });
  }
});

// ---------------------------------------------------------------
// POST /api/suggest/:roomId/share
// Saves suggestion to DB and pushes notification to members
// ---------------------------------------------------------------
router.post("/:roomId/share", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  const { suggestion } = req.body;

  if (!suggestion)
    return res.status(400).json({ error: "No suggestion provided." });

  try {
    const roomRes = await pool.query(
      "SELECT creator_id, name FROM rooms WHERE id = $1",
      [roomId],
    );

    if (roomRes.rows.length === 0)
      return res.status(404).json({ error: "Room not found." });

    const room = roomRes.rows[0];

    if (String(room.creator_id) !== String(userId))
      return res
        .status(403)
        .json({ error: "Only the room creator can share suggestions." });

    // Clear any old responses before sharing a fresh suggestion
    await pool.query("DELETE FROM suggestion_responses WHERE room_id = $1", [
      roomId,
    ]);

    // Save suggestion to DB so members can load it on page open
    await pool.query("UPDATE rooms SET last_ai_suggestion = $1 WHERE id = $2", [
      JSON.stringify(suggestion),
      roomId,
    ]);

    const { sendPushToRoomMembers } = require("../pushHelper");

    const timeStr = `${suggestion.suggested_day} at ${suggestion.suggested_start_time}`;
    const locationStr = suggestion.preferred_location
      ? ` · ${suggestion.preferred_location}`
      : "";
    const coverageStr = `${suggestion.members_covered}/${suggestion.total_members} members available`;

    // ✅ type: "ai_suggestion" tells the service worker to append fromNotification=1
    await sendPushToRoomMembers(
      roomId,
      {
        title: `📅 AI Suggestion for "${room.name}"`,
        body: `${timeStr}${locationStr} — ${coverageStr}. Tap to accept or decline.`,
        url: `/Rooms/MeetingScheduler/scheduler.html?roomId=${roomId}`,
        type: "ai_suggestion",
      },
      userId,
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Share Suggestion Error:", err.message, err);
    res.status(500).json({ error: "Failed to share suggestion." });
  }
});

// ---------------------------------------------------------------
// POST /api/suggest/:roomId/respond
// Member submits their accept/decline response
// ---------------------------------------------------------------
router.post("/:roomId/respond", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  const { response } = req.body; // "accepted" | "declined"

  if (!["accepted", "declined"].includes(response)) {
    return res.status(400).json({ error: "Invalid response value." });
  }

  try {
    // Verify membership
    const memberCheck = await pool.query(
      "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
      [roomId, userId],
    );
    if (memberCheck.rows.length === 0)
      return res.status(403).json({ error: "Not a member of this room." });

    // Verify there's an active suggestion to respond to
    const suggestionCheck = await pool.query(
      "SELECT last_ai_suggestion, creator_id, name FROM rooms WHERE id = $1",
      [roomId],
    );
    if (!suggestionCheck.rows[0]?.last_ai_suggestion)
      return res
        .status(400)
        .json({ error: "No active suggestion to respond to." });

    const { creator_id, name: roomName } = suggestionCheck.rows[0];

    // Upsert the member's response
    await pool.query(
      `INSERT INTO suggestion_responses (room_id, user_id, response)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET response = EXCLUDED.response, responded_at = CURRENT_TIMESTAMP`,
      [roomId, userId, response],
    );

    // Get the responding member's username
    const userRes = await pool.query(
      "SELECT username FROM users WHERE id = $1",
      [userId],
    );
    const username = userRes.rows[0]?.username || "A member";

    // Push the response to the room creator only
    const creatorRes = await pool.query(
      "SELECT push_subscription FROM users WHERE id = $1 AND push_subscription IS NOT NULL",
      [creator_id],
    );

    if (creatorRes.rows.length > 0) {
      const { webpush } = require("../pushHelper");
      const emoji = response === "accepted" ? "✅" : "❌";
      const verb = response === "accepted" ? "accepted" : "declined";

      try {
        const sub = creatorRes.rows[0].push_subscription;
        const parsedSub = typeof sub === "string" ? JSON.parse(sub) : sub;
        await webpush.sendNotification(
          parsedSub,
          JSON.stringify({
            title: `${emoji} Suggestion Response`,
            body: `${username} ${verb} the suggested time in "${roomName}"`,
            url: `/Rooms/MeetingScheduler/scheduler.html?roomId=${roomId}`,
          }),
        );
      } catch (pushErr) {
        console.error("Push to creator failed:", pushErr.message);
      }
    }

    res.json({ success: true, response });
  } catch (err) {
    console.error("Respond to suggestion error:", err);
    res.status(500).json({ error: "Failed to save response." });
  }
});

// ---------------------------------------------------------------
// GET /api/suggest/:roomId/responses
// Creator fetches all member responses to the current suggestion
// ---------------------------------------------------------------
router.get("/:roomId/responses", authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const roomRes = await pool.query(
      "SELECT creator_id FROM rooms WHERE id = $1",
      [roomId],
    );
    if (String(roomRes.rows[0]?.creator_id) !== String(userId))
      return res
        .status(403)
        .json({ error: "Only the creator can view responses." });

    const result = await pool.query(
      `SELECT u.username, sr.response, sr.responded_at
       FROM suggestion_responses sr
       JOIN users u ON sr.user_id = u.id
       WHERE sr.room_id = $1
       ORDER BY sr.responded_at ASC`,
      [roomId],
    );

    res.json({ responses: result.rows });
  } catch (err) {
    console.error("Fetch responses error:", err);
    res.status(500).json({ error: "Failed to fetch responses." });
  }
});

// ---------------------------------------------------------------
// DELETE /api/suggest/:roomId/shared
// Creator clears the suggestion (e.g. after meeting is finalized)
// ---------------------------------------------------------------
router.delete("/:roomId/shared", authenticateToken, async (req, res) => {
  const { roomId } = req.params;

  try {
    const roomRes = await pool.query(
      "SELECT creator_id FROM rooms WHERE id = $1",
      [roomId],
    );

    if (String(roomRes.rows[0]?.creator_id) !== String(req.user.id))
      return res
        .status(403)
        .json({ error: "Only the creator can clear suggestions." });

    await pool.query(
      "UPDATE rooms SET last_ai_suggestion = NULL WHERE id = $1",
      [roomId],
    );

    await pool.query("DELETE FROM suggestion_responses WHERE room_id = $1", [
      roomId,
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear suggestion." });
  }
});

module.exports = router;
