// PRUMAC Connect service worker.
//
// Two caches, deliberately separate:
//
//   SHELL — versioned. Wiped whenever this file changes, because its contents
//           belong to one build.
//   PAGES — NOT versioned. The driver's own screens, saved so the app opens on
//           the road. Wiping this on every deploy is what left drivers staring
//           at "You're offline" with nothing behind it: three deploys in a day
//           meant three times their saved pages were thrown away. It is cleared
//           only on sign-out, so a shared handset hands nothing to the next
//           person.
//
// Nothing here may wait forever. A request with no deadline is what left the
// launch splash up for 45 minutes.

const SHELL = "prumac-shell-v7";
const PAGES = "prumac-pages";

const NAV_TIMEOUT_MS = 5000;
const ASSET_TIMEOUT_MS = 8000;
const WARM_TIMEOUT_MS = 10000;

const OFFLINE_URL = "/offline";
// "/" is a 307 to /login or /home. A redirected response cannot be replayed for
// a navigation — the browser aborts the load — so it is never precached.
const APP_SHELL = [OFFLINE_URL, "/login", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

// What a driver needs to reach with no signal. Warmed while they are online, so
// offline availability does not depend on them having happened to visit first.
const WARM_PAGES = ["/home", "/trip/start", "/checklist", "/fault/new", "/handover", "/profile"];

const DRIVER_PAGES = [
  "/home", "/trip", "/checklist", "/handover", "/accident", "/fault",
  "/profile", "/history", "/inspection",
];
const isDriverPage = (path) => DRIVER_PAGES.some((p) => path === p || path.startsWith(p + "/"));

/** fetch that gives up, instead of hanging until the driver does. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) =>
      // One at a time: addAll throws the whole batch away if a single URL fails.
      Promise.all(APP_SHELL.map((url) => c.add(url).catch(() => {}))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Old SHELL versions go; PAGES survives the deploy.
      Promise.all(keys.filter((k) => k !== SHELL && k !== PAGES).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

/**
 * Saves the driver's screens while there is still signal.
 *
 * Called by the app after it loads. Without this, "available offline" only ever
 * meant "available if you happened to open it online first" — which is not what
 * a driver leaving the yard has done.
 */
async function warmPages() {
  const cache = await caches.open(PAGES);
  for (const path of WARM_PAGES) {
    try {
      const res = await fetchWithTimeout(new Request(path, { credentials: "same-origin" }), WARM_TIMEOUT_MS);
      if (res.ok && !res.redirected) await cache.put(path, res.clone());
    } catch {
      /* no signal, or not this driver's page — skip it */
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "warm") {
    event.waitUntil(warmPages());
    return;
  }
  // Sign-out: every page holding a driver's data goes.
  if (event.data?.type === "purge") {
    event.waitUntil(caches.delete(PAGES).catch(() => {}));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
          if (!res.redirected && res.ok && isDriverPage(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy)).catch(() => {});
          }
          return res;
        } catch (err) {
          // The driver's own page first, then the shell, then the offline
          // notice. Something always renders.
          const saved = (await caches.match(url.pathname, { cacheName: PAGES }))
            ?? (await caches.match(url.pathname, { cacheName: SHELL }));
          if (saved) return saved;
          const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL });
          if (offline) return offline;
          throw err;
        }
      })(),
    );
    return;
  }

  // Next.js fingerprints these filenames, so a cache hit is always the right
  // file and cache-first is safe. A miss goes to network — with a deadline.
  if (
    request.destination === "image" || request.destination === "font" ||
    request.destination === "style" || request.destination === "script"
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetchWithTimeout(request, ASSET_TIMEOUT_MS);
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        } catch {
          // Fail fast: an error the page can recover from beats a request still
          // pending an hour later.
          return new Response("", { status: 504, statusText: "asset timeout" });
        }
      })(),
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
