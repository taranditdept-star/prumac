// PRUMAC Connect service worker.
//
// Three caches, deliberately separate:
//
//   SHELL  — versioned. The handful of files that are NOT content-hashed
//            (/offline, /login, the manifest, the icons). Wiped per build.
//   ASSETS — NOT versioned. Everything under /_next/static, whose filenames
//            contain a content hash: a cache hit is always the right bytes, so
//            keeping the previous build's files costs storage and nothing else.
//            Wiping these per deploy is what left a saved page rendering "The
//            app didn't load" — the HTML was there, its scripts were not.
//   PAGES  — NOT versioned. The driver's own screens. Cleared only on sign-out,
//            so a shared handset hands nothing to the next person.
//
// Nothing here may wait forever. A request with no deadline is what left the
// launch splash up for 45 minutes.

const SHELL = "prumac-shell-v8";
const ASSETS = "prumac-assets";
const PAGES = "prumac-pages";
const KEEP = [SHELL, ASSETS, PAGES];

const NAV_TIMEOUT_MS = 5000;
const ASSET_TIMEOUT_MS = 8000;
const WARM_TIMEOUT_MS = 8000;
/** Total time one warm run may take, so it never outlives the worker. */
const WARM_BUDGET_MS = 45000;
const WARM_MARKER = "/__prumac-warm";
const WARM_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_WARM_PAGES = 16;
/** Roughly two builds' worth of chunks. Old ones are pruned oldest-first. */
const ASSET_LIMIT = 700;

const OFFLINE_URL = "/offline";
// "/" is a 307 to /login or /home. A redirected response cannot be replayed for
// a navigation — the browser aborts the load — so it is never precached.
const APP_SHELL = [OFFLINE_URL, "/login", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

// The floor: what every driver needs whether or not their home screen links to
// it. Anything their own home screen DOES link to is added on top, at warm time.
const WARM_PAGES = [
  "/home", "/checklist", "/trip/start", "/handover", "/handover/new",
  "/accident/new", "/fault/new", "/history", "/profile",
];

const DRIVER_PAGES = [
  "/home", "/trip", "/checklist", "/handover", "/accident", "/fault",
  "/profile", "/history", "/inspection", "/leave", "/repair", "/scorecard",
];
const isDriverPage = (path) => DRIVER_PAGES.some((p) => path === p || path.startsWith(p + "/"));
const isHashed = (path) => path.startsWith("/_next/static/");

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

const page = (path) => new Request(path, { credentials: "same-origin" });

/** Never store a redirect or an error under a URL we will serve back. */
async function putIfUsable(cache, key, res) {
  if (res && res.ok && !res.redirected) await cache.put(key, res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(SHELL);
      // Not cache.addAll: it throws the whole batch away if one URL fails, and
      // it happily stores a redirect — /login is a 307 to /home once you are
      // signed in, and a stored redirect cannot be replayed for a navigation.
      await Promise.all(APP_SHELL.map(async (url) => {
        try { await putIfUsable(c, url, await fetchWithTimeout(page(url), WARM_TIMEOUT_MS)); } catch { /* offline install */ }
      }));
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
      // Hashed assets accumulate across builds. Cache.keys() is insertion
      // ordered, so the oldest entries are the ones to drop.
      const assets = await caches.open(ASSETS);
      const entries = await assets.keys();
      if (entries.length > ASSET_LIMIT) {
        await Promise.all(entries.slice(0, entries.length - ASSET_LIMIT).map((r) => assets.delete(r)));
      }
    })(),
  );
  self.clients.claim();
});

// ── Warming ──────────────────────────────────────────────────────────────────
//
// Caching only what the driver happened to open meant "available offline" was
// really "available if you opened it online first" — and a driver leaving the
// yard has not.

/** Every /_next/static file the server-rendered HTML asks for. */
function staticUrls(html) {
  const out = new Set();
  const re = /["'(](\/_next\/static\/[^"'()\s\\]+)/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

/** Driver screens this page links to — their active trip, their vehicle. */
function driverLinks(html) {
  const out = new Set();
  const re = /href="(\/[^"#?]*)"/g;
  let m;
  while ((m = re.exec(html))) if (isDriverPage(m[1])) out.add(m[1]);
  return [...out];
}

async function saveAssets(cache, html) {
  await Promise.all(staticUrls(html).map(async (url) => {
    if (await cache.match(url)) return; // content-hashed: already the right file
    try { await putIfUsable(cache, url, await fetchWithTimeout(page(url), ASSET_TIMEOUT_MS)); } catch { /* skip */ }
  }));
}

async function needsWarm() {
  try {
    const marker = await caches.match(WARM_MARKER, { cacheName: PAGES });
    if (!marker) return true;
    const { shell, at } = await marker.json();
    return shell !== SHELL || Date.now() - at > WARM_MAX_AGE_MS;
  } catch {
    return true;
  }
}

async function warmPages(extra = []) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const queue = ["/home", ...WARM_PAGES, ...extra.filter((p) => typeof p === "string" && isDriverPage(p))];
  const done = new Set();
  const deadline = Date.now() + WARM_BUDGET_MS;
  let expanded = false;

  for (let i = 0; i < queue.length && done.size < MAX_WARM_PAGES; i++) {
    const path = queue[i];
    if (done.has(path)) continue;
    done.add(path);
    if (Date.now() > deadline) break;
    try {
      const res = await fetchWithTimeout(page(path), WARM_TIMEOUT_MS);
      if (!res.ok || res.redirected) continue; // not this driver's page
      const html = await res.clone().text();
      // Scripts BEFORE the page. A saved page whose chunks are missing renders
      // "The app didn't load" — strictly worse than not saving it at all.
      await saveAssets(assets, html);
      await pages.put(path, res);
      if (!expanded && path === "/home") {
        expanded = true;
        for (const link of driverLinks(html)) if (!queue.includes(link)) queue.push(link);
      }
    } catch {
      /* no signal, or not a page this driver can open */
    }
  }
  await pages.put(WARM_MARKER, new Response(JSON.stringify({ shell: SHELL, at: Date.now() }),
    { headers: { "content-type": "application/json" } }));
}

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type === "warm") {
    event.waitUntil((async () => {
      if (data.force || (await needsWarm())) await warmPages(data.paths ?? []);
    })());
    return;
  }
  // Sign-out: every page holding a driver's data goes. Assets are impersonal
  // and stay, so the next person's app still opens instantly.
  if (data.type === "purge") {
    event.waitUntil(caches.delete(PAGES).catch(() => {}));
  }
});

// ── Fetch ────────────────────────────────────────────────────────────────────

/**
 * When the network last let us down. Inside the window below we serve the saved
 * page immediately instead of making the driver watch a five-second timeout on
 * every single tap, and re-check in the background.
 */
let lastFailureAt = 0;
const OFFLINE_WINDOW_MS = 15000;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  if (request.mode === "navigate") {
    const path = url.pathname;
    const saved = () => caches.match(path, { cacheName: PAGES });

    const revalidate = async () => {
      try {
        const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
        lastFailureAt = 0;
        if (res.ok && !res.redirected && isDriverPage(path)) {
          await (await caches.open(PAGES)).put(path, res);
        }
      } catch {
        lastFailureAt = Date.now();
      }
    };

    event.respondWith(
      (async () => {
        const probablyOffline =
          self.navigator.onLine === false || Date.now() - lastFailureAt < OFFLINE_WINDOW_MS;
        if (probablyOffline) {
          const hit = await saved();
          if (hit) { event.waitUntil(revalidate()); return hit; }
        }
        try {
          const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
          lastFailureAt = 0;
          if (res.ok && !res.redirected && isDriverPage(path)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(path, copy)).catch(() => {});
          }
          return res;
        } catch (err) {
          lastFailureAt = Date.now();
          // The driver's own page first, then the shell, then the offline
          // notice. Something always renders.
          const hit = (await saved()) ?? (await caches.match(path, { cacheName: SHELL }));
          if (hit) return hit;
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
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(isHashed(url.pathname) ? ASSETS : SHELL)
              .then((c) => c.put(request, copy)).catch(() => {});
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
