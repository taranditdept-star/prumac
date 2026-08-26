// PRUMAC Connect service worker.
// Goals: make the app installable + resilient offline for the app shell.
// Strategy: network-first for navigations (always fresh when online, cached
// fallback offline); cache-first for static assets. API/auth calls are never
// cached. Keep this conservative — GPS sync has its own IndexedDB buffer.

const CACHE = "prumac-v3";
// A navigation that never resolves is why the app "sticks on load": on weak
// mobile data fetch() has no timeout of its own, so the page waits forever
// instead of falling back to the cached shell.
const NAV_TIMEOUT_MS = 5000;
const APP_SHELL = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
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
          // Only the shell is cached. Caching every authenticated page would
          // leave one driver's screens readable by the next person on a shared
          // handset, and stale HTML can point at chunks a deploy has removed.
          if (url.pathname === "/" && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          }
          return res;
        } catch (err) {
          const cached = (await caches.match(request)) || (await caches.match("/"));
          if (cached) return cached;
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
