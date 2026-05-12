// File: Frontend/sw.js

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

// ----------------------------------------------------------------
// PUSH — receive and display the notification
// ----------------------------------------------------------------
self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {
      title: "ScheduleMate Pro",
      body: event.data ? event.data.text() : "You have a new notification.",
      url: "/Dashboard/dashboard.html",
    };
  }

  const title = payload.title || "ScheduleMate Pro";
  const url = payload.url || "/Dashboard/dashboard.html";

  const options = {
    body: payload.body || "",
    icon: "/Images/favicon.png",
    badge: "/Images/favicon.png",
    // Store full payload data so notificationclick can use type info
    data: { url, type: payload.type || null },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ----------------------------------------------------------------
// NOTIFICATIONCLICK — navigate to the correct page on tap
// ----------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetPath = notifData.url || "/Dashboard/dashboard.html";

  // If this is an AI suggestion notification, append a flag so the
  // scheduler page knows to surface the member-response UI immediately
  if (notifData.type === "ai_suggestion") {
    const separator = targetPath.includes("?") ? "&" : "?";
    targetPath = `${targetPath}${separator}fromNotification=1`;
  }

  const absoluteUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Match any window already on the scheduler page (ignore query params)
        const schedulerBase = new URL(
          "/Rooms/MeetingScheduler/scheduler.html",
          self.location.origin,
        ).href;

        for (const client of windowClients) {
          const clientBase = client.url.split("?")[0];
          if (clientBase === schedulerBase && "navigate" in client) {
            return client.navigate(absoluteUrl).then((c) => c && c.focus());
          }
        }

        // App open on a different page — navigate it
        for (const client of windowClients) {
          if ("navigate" in client && "focus" in client) {
            return client.navigate(absoluteUrl).then((c) => c && c.focus());
          }
        }

        // App closed — open new window
        if (clients.openWindow) {
          return clients.openWindow(absoluteUrl);
        }
      }),
  );
});
