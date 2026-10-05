const CACHE_NAME = "verlanglijst-cache-v2";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/firebase-config.js",
  "./manifest.json",
  "./releases.json"
];

// Install: direct cachen en activeren zonder te wachten
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: oude caches weggooien en direct de controle overnemen
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first voor dynamische JSON/HTML, Cache-fallback
self.addEventListener("fetch", (event) => {
  // Laat Firebase / Firestore verzoeken altijd direct door het netwerk afhandelen
  if (
    event.request.url.includes("firestore.googleapis.com") ||
    event.request.url.includes("identitytoolkit.googleapis.com") ||
    event.request.url.includes("firebaseio.com")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Update cache als het verzoek slaagt
        if (networkResponse && networkResponse.status === 200 && event.request.method === "GET") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
