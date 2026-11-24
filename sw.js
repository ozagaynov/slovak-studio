// Service Worker for Slovak & English Studio v3 (Four Strands PWA)
const CACHE_NAME = "slovak-studio-v9";
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
            if (k !== CACHE_NAME && k !== "slovak-tts-v2") return caches.delete(k);
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
    url.includes("/chat/completions") ||
    url.includes(":11434/") ||
    url.includes(":5000/")
  ) {
    return;
  }

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
