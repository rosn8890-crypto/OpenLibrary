/* OpenLibrary Service Worker (sw.js)
   Enables offline reading, instant caching, and PWA standalone app support.
*/

const CACHE_NAME = "openlibrary-app-v4";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./reader.html",
  "./book.html",
  "./categories.html",
  "./dashboard.html",
  "./favorites.html",
  "./login.html",
  "./upload.html",
  "./manifest.json",
  "./favicon.svg",
  "./css/style.css",
  "./js/theme.js",
  "./js/config.js",
  "./js/common.js",
  "./js/pwa.js",
  "./js/ambient.js",
  "./js/tts.js",
  "./js/focus-tools.js",
  "./js/home.js",
  "./js/reader.js",
  "./js/book.js",
  "./js/categories.js",
  "./js/dashboard.js",
  "./js/favorites.js",
  "./js/login.js",
  "./js/upload.js",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./images/icon-maskable-192.png",
  "./images/icon-maskable-512.png",
  "./images/hero-library.svg",
  "./images/feature-modes.svg",
  "./images/feature-progress.svg",
  "./images/feature-library.svg",
  "./images/topic-default.svg",
  "./images/topic-cybersecurity.svg",
  "./images/topic-programming.svg",
  "./images/topic-science.svg",
  "./images/topic-self-improvement.svg",
  "./images/topic-exam-preparation.svg"
];

// Install: pre-cache all shell assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // cache each asset, silently ignore optional ones that might fail
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(new Request(url, { cache: "reload" })).catch(err => {
            console.warn("SW: failed to pre-cache", url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: smart caching strategy
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET requests (e.g. Supabase POST/PUT auth)
  if (req.method !== "GET") return;

  // Supabase API requests: Network first with graceful offline message
  if (url.hostname.includes("supabase.co")) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ error: "Offline mode active. Connect to network to sync data." }), {
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  // CDNs (PDF.js, Fonts, Supabase CDN): Cache-First / Stale-While-Revalidate so they work offline
  if (url.origin.includes("cdnjs.cloudflare.com") ||
      url.origin.includes("cdn.jsdelivr.net") ||
      url.origin.includes("fonts.googleapis.com") ||
      url.origin.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Local assets & HTML: Cache with Network Fallback & Background Update
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(err => {
        // If offline and navigating to a page, serve cached page or index.html
        if (req.mode === "navigate") {
          return cachedResponse || caches.match("./index.html");
        }
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Handle update messages
self.addEventListener("message", event => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
