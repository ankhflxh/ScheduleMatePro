// File: Backend/pushHelper.js
const webpush = require("web-push");
const pool = require("./db");
require("dotenv").config();

webpush.setVapidDetails(
  process.env.mailto,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

async function sendPushToRoomMembers(roomId, payload, excludeUserId = null) {
  try {
    let query, params;

    if (excludeUserId) {
      query = `
        SELECT u.push_subscription
        FROM users u
        JOIN room_members rm ON rm.user_id = u.id
        WHERE rm.room_id = $1
          AND u.id != $2
          AND u.push_subscription IS NOT NULL
      `;
      params = [roomId, excludeUserId];
    } else {
      query = `
        SELECT u.push_subscription
        FROM users u
        JOIN room_members rm ON rm.user_id = u.id
        WHERE rm.room_id = $1
          AND u.push_subscription IS NOT NULL
      `;
      params = [roomId];
    }

    const result = await pool.query(query, params);

    const pushPromises = result.rows.map(({ push_subscription }) => {
      // Always parse to object — DB may store it as a JSON string
      const sub =
        typeof push_subscription === "string"
          ? JSON.parse(push_subscription)
          : push_subscription;

      return webpush
        .sendNotification(sub, JSON.stringify(payload))
        .catch((err) => {
          console.error("❌ Push notification failed:", err.message);
        });
    });

    await Promise.all(pushPromises);
  } catch (err) {
    console.error("❌ sendPushToRoomMembers error:", err);
  }
}

module.exports = { webpush, sendPushToRoomMembers };
