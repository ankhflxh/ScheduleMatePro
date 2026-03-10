// File: Frontend/sw.js

const CACHE_NAME = "schedulemate-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/LandingPage/index.html",
  "/LoginPage/login.html",
  "/Dashboard/dashboard.html",
  "/Images/favicon.png",
  "/Dashboard/dashboard.css",
  "/Dashboard/dashboard.js",
];

// 1. Install Service Worker
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// 2. Fetch Assets (Network First, fall back to Cache)
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    }),
  );
});

// ----------------------------------------------------------------
// --- PUSH NOTIFICATION LISTENERS --------------------------------
// ----------------------------------------------------------------

// 3. Listen for incoming Push Notifications from the server
self.addEventListener("push", function (event) {
  console.log("Push notification received!");

  let data = {
    title: "ScheduleMate Pro",
    body: "You have a new notification!",
  };

  // Check if the server sent specific text (like the meeting reminder)
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: "/Images/favicon.png", // Uses your existing favicon!
    badge: "/Images/favicon.png",
    vibrate: [200, 100, 200], // Makes the phone vibrate
    data: {
      url: "/Dashboard/dashboard.html", // Sends them to the dashboard when clicked
    },
  };

  // Tell the phone to draw the notification card on the screen
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 4. Listen for when the user clicks on the notification
self.addEventListener("notificationclick", function (event) {
  console.log("Notification clicked!");
  event.notification.close();

  // When clicked, open the app or focus the tab if it's already open
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        if (clientList.length > 0) {
          let client = clientList[0];
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i];
            }
          }
          return client.focus();
        }
        return clients.openWindow(event.notification.data.url);
      }),
  );
});
