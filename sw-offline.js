// Cache hors ligne MedQuiz. À charger depuis sw.js :  importScripts("sw-offline.js");
const MQ_CACHE = "medquiz-offline-v1";
const MQ_SHELL = ["./", "index.html", "icon-192.png", "manifest.json"];
const MQ_CDN = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(MQ_CACHE).then((c) => Promise.all(MQ_SHELL.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("medquiz-offline-") && k !== MQ_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // jamais d'API en cache
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !MQ_CDN.includes(url.hostname)) return;
  if (sameOrigin && /sw(-offline)?\.js$/.test(url.pathname)) return;

  if (req.mode === "navigate") {
    // Réseau d'abord, cache en secours
    e.respondWith(
      fetch(req).then((res) => { const cp = res.clone(); caches.open(MQ_CACHE).then((c) => c.put("index.html", cp)); return res; })
        .catch(() => caches.match("index.html").then((r) => r || caches.match("./"))),
    );
    return;
  }
  // Ressources statiques : cache d'abord, mise à jour en arrière-plan
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) { const cp = res.clone(); caches.open(MQ_CACHE).then((c) => c.put(req, cp)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
