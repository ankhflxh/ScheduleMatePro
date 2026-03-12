// File: Backend/pushHelper.js
const webpush = require("web-push");
const pool = require("./db");
require("dotenv").config();

webpush.setVapidDetails(
  process.env.mailto,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

/**
 * Send a push notification to all members of a room.
 * @param {number|string} roomId - The room ID
 * @param {{ title: string, body: string, url?: string }} payload - Notification content
 * @param {number|string|null} excludeUserId - Optional user ID to exclude (e.g. the sender)
 */
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
      return webpush
        .sendNotification(push_subscription, JSON.stringify(payload))
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
