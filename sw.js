/* Lean for Life service worker — offline app shell */
var CACHE = "lfl-v6";
var SHELL = "./";
var NAV_TIMEOUT_MS = 3000;
var HTML_CONTENT_TYPE = "text/html";
var OFFLINE_STATUS = 503;
var OFFLINE_STATUS_TEXT = "offline";

var ASSETS = [
  SHELL,
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-180.png",
  "lean-for-life-meal-plan.pdf",
  "lean-for-life-research.pptx",
  "exercises/bench.gif",
  "exercises/cablerow.gif",
  "exercises/dbrow.gif",
  "exercises/deadlift.gif",
  "exercises/facepull.gif",
  "exercises/inclinedb.gif",
  "exercises/kneeraise.gif",
  "exercises/legcurl.gif",
  "exercises/legpress.gif",
  "exercises/ohp.gif",
  "exercises/plank.gif",
  "exercises/pulldown.gif",
  "exercises/pullup.gif",
  "exercises/rdl.gif",
  "exercises/squat.gif"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache individually so one missing file doesn't fail the whole install,
      // but warn loudly — a silent failure here once hid a broken shell path
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {
          console.warn("[lfl-sw] precache failed:", u);
          return null;
        });
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

function offlineResponse() {
  return new Response("", { status: OFFLINE_STATUS, statusText: OFFLINE_STATUS_TEXT });
}

function isCacheableResponse(res) {
  return !!res && res.ok;
}

function isHtmlResponse(res) {
  return (res.headers.get("content-type") || "").indexOf(HTML_CONTENT_TYPE) === 0;
}

function putInCache(key, res) {
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {});
}

/* Navigations are network-first so a new deploy shows up on the next launch instead of
   being masked by the cached shell — but they never wait longer than NAV_TIMEOUT_MS,
   so a weak connection falls back to the cache rather than a blank screen. */
function navigateWithFallback(req) {
  var network = fetch(req).then(function (res) {
    // only the HTML document may overwrite the shell entry; `download` links
    // (the meal-plan PDF, the research PPTX) are navigations too
    if (isCacheableResponse(res) && isHtmlResponse(res)) putInCache(SHELL, res);
    return res;
  }).catch(function () { return null; });

  var timeout = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, NAV_TIMEOUT_MS);
  });

  return Promise.race([network, timeout]).then(function (res) {
    if (res) return res;
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      return caches.match(SHELL).then(function (shell) {
        if (shell) return shell;
        return network.then(function (late) { return late || offlineResponse(); });
      });
    });
  });
}

/* Everything else (icons, exercise GIFs, documents, fonts) is cache-first: these are
   versioned by the CACHE name, so serving them from disk is both correct and instant. */
function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      // runtime-cache what we are allowed to store; opaque cross-origin responses
      // (Google Fonts, fetched no-cors) report status 0 and are skipped here
      if (isCacheableResponse(res) && req.url.indexOf("http") === 0) putInCache(req, res);
      return res;
    }).catch(function () { return offlineResponse(); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(req.mode === "navigate" ? navigateWithFallback(req) : cacheFirst(req));
});
