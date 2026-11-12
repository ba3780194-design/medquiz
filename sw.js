const CACHE = "medquiz-v1";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
// Réseau d'abord, cache en secours (hors ligne). Les appels Supabase/CDN ne sont pas interceptés.
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { const copie = res.clone(); caches.open(CACHE).then(c => c.put(r, copie)); return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("index.html")))
  );
});
