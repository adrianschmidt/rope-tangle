const CACHE = "rope-tangle-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(self.registration.scope))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rope-tangle-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const urls = event.data && event.data.cacheUrls;
  if (!Array.isArray(urls)) return;
  const assets = new URL("assets/", self.registration.scope).href;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls.filter((u) => typeof u === "string" && u.startsWith(assets)))));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope).pathname;
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(scope) || url.pathname.startsWith(`${scope}spike/`) || url.pathname.startsWith(`${scope}dev/`)) return;
  if (url.pathname.startsWith(`${scope}assets/`)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req, { ignoreVary: true }).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || caches.match(scope, { ignoreVary: true }))),
  );
});
