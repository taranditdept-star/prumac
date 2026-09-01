"use client";

import { useEffect } from "react";

/**
 * Gets the app out of a stuck start.
 *
 * Three things strand a phone on a blank or frozen screen, and none of them
 * recover on their own:
 *
 *   1. A deploy lands while a tab is open. The page holds a script URL that no
 *      longer exists, the chunk 404s, and React never finishes mounting.
 *   2. A new service worker takes control mid-session, so the running page and
 *      the controller disagree about which build they are on.
 *   3. The first paint never arrives at all — a hung request on bad data.
 *
 * The reload is deliberately grudging: at most one per RELOAD_COOLDOWN, tracked
 * in sessionStorage. A reload loop on a broken deploy would be far worse than
 * the stall it is trying to fix, because the driver could never reach the app
 * to see an error at all.
 */
const RELOAD_KEY = "prumac:last-recovery-reload";
const RELOAD_COOLDOWN = 60_000;
/** Generous: a cold start on 3G is slow, and a false reload costs the user their place. */
const BOOT_TIMEOUT = 20_000;
/**
 * Last resort. A service worker that wedges is self-sealing: the fix ships
 * inside the worker, but a driver stuck on the launch splash can never load the
 * page that would replace it. Drivers reported sitting there for 45 minutes.
 *
 * So if the app has not become usable in this long, tear the worker out
 * entirely, drop its caches and reload from the network. The app loses offline
 * support until the worker reinstalls — which is a far better outcome than a
 * phone that never opens the app at all.
 */
const UNSTICK_TIMEOUT = 25_000;

const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk [\d]+ failed|Importing a module script failed|error loading dynamically imported module/i;

function reloadOnce(reason: string) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN) return; // already tried; let it fail visibly
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return; // private mode with no sessionStorage — never risk an unbounded loop
  }
  console.warn(`[prumac] recovering from a stuck start: ${reason}`);
  window.location.reload();
}

export function StuckRecovery() {
  useEffect(() => {
    // React is running, so the app booted: stand the inline watchdog down
    // before it tears out a service worker that is working perfectly well.
    (window as unknown as { __prumacCancelWatchdog?: () => void }).__prumacCancelWatchdog?.();

    // 1. A stale chunk after a deploy.
    const onError = (e: ErrorEvent) => {
      if (CHUNK_ERROR.test(e.message ?? "")) reloadOnce("stale chunk");
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
      if (CHUNK_ERROR.test(msg)) reloadOnce("stale chunk");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // 2. A new service worker took over — the running page is now the old build.
    //    On a first ever visit there is no controller yet and one arrives
    //    normally; reloading then would bounce every new user for nothing.
    const hadController = Boolean(navigator.serviceWorker?.controller);
    const onController = () => {
      if (hadController) reloadOnce("new version activated");
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onController);

    // 3. Nothing painted. If this effect ran, React mounted, so the app is
    //    alive — this only catches a first paint that never lands.
    const boot = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return; // backgrounded, not stuck
      if (document.body.innerText.trim().length === 0) reloadOnce("blank after boot");
    }, BOOT_TIMEOUT);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      navigator.serviceWorker?.removeEventListener("controllerchange", onController);
      window.clearTimeout(boot);
    };
  }, []);

  return null;
}
