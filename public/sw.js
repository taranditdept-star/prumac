// PRUMAC Connect service worker.
// Goals: make the app installable + resilient offline for the app shell.
// Strategy: network-first for navigations (always fresh when online, cached
// fallback offline); cache-first for static assets. API/auth calls are never
// cached. Keep this conservative — GPS sync has its own IndexedDB buffer.

const CACHE = "prumac-v5";
// A navigation that never resolves is why the app "sticks on load": on weak
// mobile data fetch() has no timeout of its own, so the page waits forever
// instead of falling back to the cached shell.
const NAV_TIMEOUT_MS = 5000;
const CACHEABLE_PAGES = new Set(["/offline", "/login"]);

// A driver needs these to open with no signal — the whole point of queueing
// work offline is being able to reach the form in the first place. They DO
// contain signed-in content, so the cache is wiped on sign-out (see the
// "purge" message below); without that, the next person on a shared handset
// could read the last driver's screens.
const DRIVER_PAGES = [
  "/home", "/trip", "/checklist", "/handover", "/accident", "/fault",
  "/profile", "/history", "/inspection",
];
const isDriverPage = (path) => DRIVER_PAGES.some((p) => path === p || path.startsWith(p + "/"));
// NEVER precache "/" — it is a 307 to /login or /home, and a redirected
// response cannot be served back for a navigation: the browser aborts the whole
// load with ERR_FAILED, which is exactly how the app failed to open offline.
// /offline and /login are real pages that render without a redirect.
const OFFLINE_URL = "/offline";
const APP_SHELL = [OFFLINE_URL, "/login", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // One at a time: addAll rejects the whole batch if a single URL fails,
      // which previously left the cache completely empty and the app with
      // nothing to fall back on.
      Promise.all(APP_SHELL.map((url) => c.add(url).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// Sign-out clears every page holding a driver's data, so a shared handset
// hands nothing to the next person.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "purge") return;
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      for (const req of await c.keys()) {
        const path = new URL(req.url).pathname;
        if (isDriverPage(path)) await c.delete(req);
      }
    }).catch(() => {}),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API, auth, or Next data/RSC requests — always go to network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        let timer;
        try {
          const res = await Promise.race([
            fetch(request),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error("nav-timeout")), NAV_TIMEOUT_MS);
            }),
          ]);
          // A redirected response must never be cached or replayed: serving one
          // for a navigation throws and the page fails to load.
          if (!res.redirected && res.ok && (CACHEABLE_PAGES.has(url.pathname) || isDriverPage(url.pathname))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy)).catch(() => {});
          }
          return res;
        } catch (err) {
          // Exact page first, then the offline page. Something always renders —
          // the browser's own error screen is not an acceptable answer.
          const exact = await caches.match(url.pathname);
          if (exact) return exact;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          throw err;
        } finally {
          clearTimeout(timer);
        }
      })(),
    );
    return;
  }

  // Next.js fingerprints these filenames, so a cache hit is always the right
  // file and cache-first is safe. A miss goes to network and is stored.
  if (request.destination === "image" || request.destination === "font" || request.destination === "style" || request.destination === "script") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});

// ── Web Push (emergency alerts) ──────────────────────────────────────────────
// Fired by the push service even when the app is closed. We surface a
// persistent, vibrating notification so an accident is impossible to miss.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "PRUMAC alert", body: event.data ? event.data.text() : "" };
  }

  // Chat messages are gentler than emergency alerts: they auto-dismiss and
  // vibrate softly instead of staying on screen with the emergency pattern.
  const isChat = data.kind === "chat";
  const title = data.title || (isChat ? "New message" : "PRUMAC emergency");
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || (isChat ? "prumac-chat" : "prumac-alert"),
    renotify: true, // re-alert even if a notification with this tag exists
    requireInteraction: !isChat, // emergencies stay until acted on; chat auto-dismisses
    vibrate: isChat ? [120, 60, 120] : [400, 200, 400, 200, 400, 200, 600],
    data: { url: data.url || (isChat ? "/home" : "/live") },
  };

  event.waitUntil(
    (async () => {
      // Chat: if the app is already open and focused, the message is on screen
      // via Realtime — an OS alert would just be noise. Suppress it. Emergency
      // alerts always show regardless of focus.
      if (isChat) {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (wins.some((c) => c.focused || c.visibilityState === "visible")) return;
      }
      await self.registration.showNotification(title, options);
    })(),
  );
});

// Tapping the notification focuses an existing tab (navigating it to the
// target) or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/live";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
