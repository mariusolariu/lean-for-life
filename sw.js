/* Lean for Life service worker — offline app shell */
var CACHE = "lfl-v1";
var ASSETS = [
  "lean-for-life.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-180.png",
  "lean-for-life-meal-plan.pdf"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache individually so one missing file doesn't fail the whole install
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        // runtime-cache same-origin successful responses (fonts, etc.)
        if (res && res.status === 200 && e.request.url.indexOf("http") === 0) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
        }
        return res;
      }).catch(function () {
        // offline & uncached: for navigations, fall back to the app shell
        if (e.request.mode === "navigate") return caches.match("lean-for-life.html");
        return new Response("", { status: 503, statusText: "offline" });
      });
    })
  );
});
