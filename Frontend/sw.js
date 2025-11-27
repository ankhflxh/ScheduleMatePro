const CACHE_NAME = "schedulemate-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/LandingPage/index.html",
  "/LoginPage/login.html",
  "/Dashboard/dashboard.html",
  "/Images/favicon.png",
  "/Dashboard/dashboard.css",
  "/Dashboard/dashboard.js"
];

// 1. Install Service Worker
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Fetch Assets (Network First, fall back to Cache)
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});