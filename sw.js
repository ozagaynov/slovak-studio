// Service Worker for Slovak & English Studio v3.2 (Four Strands PWA)
const CACHE_NAME = "slovak-studio-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/bento.css",
  "./js/app.js",
  "./js/store.js",
  "./js/srs.js",
  "./js/audio.js",
  "./js/ai.js",
  "./js/gestures.js",
  "./js/texts_data.js",
  "./data/vocab-sk.json",
  "./data/vocab-en.json",
  "./data/scenarios.json",
  "./data/texts.json",
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
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => {
            if (k !== CACHE_NAME && k !== "slovak-tts-v2") {
              console.log("[SW] Purging stale cache:", k);
              return caches.delete(k);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (
    e.request.method !== "GET" ||
    url.includes("api.elevenlabs.io") ||
    url.includes("openrouter.ai") ||
    url.includes("aidostup.site") ||
    url.includes("translate.google.com") ||
    url.includes("googleapis.com") ||
    url.includes("/chat/completions") ||
    url.includes(":11434/") ||
    url.includes(":5000/")
  ) {
    return;
  }

  // Network-First strategy: fetch fresh content from network, update cache, fallback to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          if (cached) return cached;
          if (e.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
  );
});
