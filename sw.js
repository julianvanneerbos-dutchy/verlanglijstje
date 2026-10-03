// Eenvoudige service worker voor PWA installatie
const CACHE_NAME = "verlanglijst-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener("fetch", (e) => {
  // Laat data en Firebase calls altijd direct naar het netwerk gaan
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
