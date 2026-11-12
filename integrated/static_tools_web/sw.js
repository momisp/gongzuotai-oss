const CACHE_NAME = "tools-site-v46";

const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/main.js",
  "./js/splash.js",
  "./js/ui-motion.js",
  "./js/lib/gsap.min.js",
  "./js/lib/md5.min.js",
  "./js/tools/json-formatter.js",
  "./js/tools/base64-encoder.js",
  "./js/tools/timestamp-converter.js",
  "./js/tools/case-converter.js",
  "./js/tools/url-tool.js",
  "./js/tools/html-tool.js",
  "./js/tools/hex-tool.js",
  "./js/tools/hash-tool.js",
  "./js/tools/jwt-tool.js",
  "./js/tools/regex-tool.js",
  "./js/tools/color-tool.js",
  "./js/tools/cssunit-tool.js",
  "./js/tools/cron-tool.js",
  "./js/tools/uuid-tool.js",
  "./js/tools/random-tool.js",
  "./js/tools/pick-tool.js",
  "./js/tools/bili-subs-tool.js",
  "./js/tools/bili-story-tool.js",
  "./js/tools/diff-tool.js",
  "./js/tools/query-tool.js",
  "./js/tools/ua-tool.js",
  "./js/tools/image-tool.js",
  "./js/tools/textcode-tool.js",
  "./js/tools/radix-tool.js",
  "./js/tools/units-tool.js",
  "./js/tools/sysmon-tool.js",
  "./js/tools/netrank-tool.js",
  "./js/tools/amap-mark-tool.js",
  "./js/tools/timeline-tool.js",
  "./js/tools/gamedocs-tool.js",
  "./assets/gamedocs-records.json",
  "./js/games-manifest.js",
  "./js/tools/minigames-tool.js",
  "./js/tools/herself-tool.js",
  "./js/tools/opscmd-tool.js",
  "./js/tools/animpreview-tool.js",
  "./js/lib/ScrollTrigger.min.js",
  "./games/x13/index.html",
  "./tools/amap-satellite-mark.html",
  "./assets/icon-192x192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
