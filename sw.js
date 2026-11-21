// Service Worker for Slovak & English Studio PWA
const CACHE_NAME = "slovak-studio-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/favicon.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Bypass API and TTS requests
  if (
    e.request.url.includes("aidostup.site") ||
    e.request.url.includes("translate.google.com") ||
    e.request.url.includes("/chat/completions")
  ) {
    return;
  }

  // Network-First for HTML navigation so updates arrive instantly
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => caches.match(e.request) || caches.match("./index.html"))
    );
    return;
  }

  // Cache-First for static assets (icons, styles)
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
