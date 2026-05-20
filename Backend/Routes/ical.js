// File: Backend/Routes/ical.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticateToken } = require("./auth");
const https = require("https");
const http = require("http");

// ─── Simple iCal parser (no library needed) ───────────────────────
function parseIcal(text) {
  const events = [];
  const lines = text
    .replace(/\r\n /g, "")
    .replace(/\r\n\t/g, "")
    .split(/\r\n|\n|\r/);

  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT" && current) {
      if (current.start && current.summary) events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith("SUMMARY:")) {
        current.summary = line.slice(8).trim();
      } else if (line.startsWith("DTSTART")) {
        current.start = parseIcalDate(line);
        current.startRaw = line;
      } else if (line.startsWith("DTEND")) {
        current.end = parseIcalDate(line);
      } else if (line.startsWith("LOCATION:")) {
        current.location = line.slice(9).trim();
      } else if (line.startsWith("RRULE:")) {
        current.rrule = line.slice(6).trim();
      }
    }
  }
  return events;
}

function parseIcalDate(line) {
  // Handle: DTSTART;TZID=...:20251007T090000 or DTSTART:20251007T090000Z or DTSTART;VALUE=DATE:20251007
  const val = line.includes(":") ? line.split(":").slice(1).join(":") : "";
  if (!val) return null;

  if (val.length === 8) {
    // DATE only: 20251007
    return new Date(
      parseInt(val.slice(0, 4)),
      parseInt(val.slice(4, 6)) - 1,
      parseInt(val.slice(6, 8)),
    );
  }

  // DATETIME: 20251007T090000Z or 20251007T090000
  const y = parseInt(val.slice(0, 4));
  const mo = parseInt(val.slice(4, 6)) - 1;
  const d = parseInt(val.slice(6, 8));
  const h = parseInt(val.slice(9, 11));
  const m = parseInt(val.slice(11, 13));
  const s = parseInt(val.slice(13, 15)) || 0;

  return val.endsWith("Z")
    ? new Date(Date.UTC(y, mo, d, h, m, s))
    : new Date(y, mo, d, h, m, s);
}

// Expand recurring events (weekly pattern) for the next 12 weeks
function expandRecurring(event, weeks = 12) {
  if (!event.rrule || !event.rrule.includes("WEEKLY")) return [event];

  const expanded = [];
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  const duration = end ? end - start : 3600000;

  for (let i = 0; i < weeks; i++) {
    const newStart = new Date(start.getTime() + i * 7 * 24 * 3600 * 1000);
    const newEnd = new Date(newStart.getTime() + duration);
    expanded.push({ ...event, start: newStart, end: newEnd });
  }
  return expanded;
}

// Fetch a URL (http or https)
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// ─── GET /api/ical/links — get saved links ────────────────────────
router.get("/links", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT ical_links FROM users WHERE id = $1",
      [req.user.id],
    );
    res.json({ links: result.rows[0]?.ical_links || [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to load links." });
  }
});

// ─── POST /api/ical/links — save links ───────────────────────────
router.post("/links", authenticateToken, async (req, res) => {
  const { links } = req.body; // array of { url, label }
  if (!Array.isArray(links))
    return res.status(400).json({ error: "links must be an array." });

  // Validate each URL
  for (const l of links) {
    if (!l.url || !l.url.startsWith("http"))
      return res.status(400).json({ error: `Invalid URL: ${l.url}` });
  }

  try {
    await pool.query("UPDATE users SET ical_links = $1 WHERE id = $2", [
      JSON.stringify(links),
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save links." });
  }
});

// ─── GET /api/ical/events — fetch & parse all calendars ──────────
// Returns events for the current month (+/- buffer)
router.get("/events", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT ical_links FROM users WHERE id = $1",
      [req.user.id],
    );
    const links = result.rows[0]?.ical_links || [];

    if (links.length === 0) return res.json({ events: [] });

    const allEvents = [];

    await Promise.all(
      links.map(async (link) => {
        try {
          const text = await fetchUrl(link.url);
          const parsed = parseIcal(text);
          const expanded = parsed.flatMap((e) => expandRecurring(e));
          expanded.forEach((e) => {
            if (e.start) {
              allEvents.push({
                summary: e.summary,
                start: e.start,
                end: e.end || null,
                location: e.location || null,
                calendarLabel: link.label || "Calendar",
              });
            }
          });
        } catch (err) {
          console.error(`Failed to fetch iCal from ${link.url}:`, err.message);
        }
      }),
    );

    // Filter to roughly current month ± 2 months
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 3, 0);

    const filtered = allEvents.filter((e) => {
      const d = new Date(e.start);
      return d >= from && d <= to;
    });

    // Sort by start
    filtered.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json({ events: filtered });
  } catch (err) {
    console.error("iCal events error:", err);
    res.status(500).json({ error: "Failed to fetch calendar events." });
  }
});

module.exports = router;
