// File: Frontend/sw.js

const CACHE_NAME = "schedulemate-v1";

// ----------------------------------------------------------------
// INSTALL — cache the app shell
// ----------------------------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// ----------------------------------------------------------------
// ACTIVATE — take control immediately
// ----------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// ----------------------------------------------------------------
// PUSH — show the notification when a push arrives
// ----------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: "ScheduleMate Pro",
      body: event.data ? event.data.text() : "You have a new notification.",
    };
  }

  const title = data.title || "ScheduleMate Pro";
  const options = {
    body: data.body || "",
    icon: "/Images/favicon.png",
    badge: "/Images/favicon.png",
    data: { url: data.url || "/Dashboard/dashboard.html" },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ----------------------------------------------------------------
// NOTIFICATIONCLICK — open or focus the correct page when tapped
// ----------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/Dashboard/dashboard.html";

  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If the app is already open on that exact URL, just focus it
        for (const client of windowClients) {
          if (client.url === absoluteUrl && "focus" in client) {
            return client.focus();
          }
        }

        // If the app is open but on a different page, navigate it
        for (const client of windowClients) {
          if ("navigate" in client) {
            return client.navigate(absoluteUrl).then((c) => c && c.focus());
          }
        }

        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(absoluteUrl);
        }
      }),
  );
});
