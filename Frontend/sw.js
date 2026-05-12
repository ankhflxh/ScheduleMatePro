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
    // Store url directly as a string in data — simplest and most reliable
    data: url,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ----------------------------------------------------------------
// NOTIFICATIONCLICK — navigate to the correct page on tap
// ----------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // data is the url string we stored above
  const targetPath = event.notification.data || "/Dashboard/dashboard.html";
  const absoluteUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // App is already open on the exact target page — just focus it
        for (const client of windowClients) {
          if (client.url === absoluteUrl && "focus" in client) {
            return client.focus();
          }
        }

        // App is open on a different page — navigate to the right one
        for (const client of windowClients) {
          if ("navigate" in client && "focus" in client) {
            return client.navigate(absoluteUrl).then((c) => c && c.focus());
          }
        }

        // App is closed — open it
        if (clients.openWindow) {
          return clients.openWindow(absoluteUrl);
        }
      }),
  );
});
