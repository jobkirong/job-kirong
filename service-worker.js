// ============================================================
// 👑 KIRONG AI — SERVICE WORKER V2
// Fast repeat loads via stale-while-revalidate app shell caching.
// NEVER caches /api/* — those must always be fresh (payments,
// plan status, projects all depend on live data).
// ============================================================

const CACHE_NAME = "kirong-ai-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  // Never touch non-GET requests (POST /api/chat, PUT /api/projects, etc.)
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ----------------------------------------------------------
  // CRITICAL: never cache API calls. Payment status polling,
  // plan/usage data, and project lists must always be live —
  // caching these silently broke the M-Pesa payment flow before
  // (polling would keep returning a cached "pending" forever).
  // ----------------------------------------------------------
  if (url.pathname.startsWith("/api/")) {
    return; // let the browser handle it normally, no interception
  }

  // Cross-origin requests (Pollinations-generated images, Google
  // Fonts, etc.) — pass straight through, don't manage their cache.
  if (url.origin !== self.location.origin) {
    return;
  }

  // ----------------------------------------------------------
  // APP SHELL: stale-while-revalidate.
  // Serve the cached copy instantly (fast!), while fetching a
  // fresh copy in the background and updating the cache for next
  // time. This means updates roll out automatically within one
  // extra reload — no manual cache-busting needed for every deploy.
  // ----------------------------------------------------------
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    )
  );
});
