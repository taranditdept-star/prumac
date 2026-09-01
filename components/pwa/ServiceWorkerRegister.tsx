"use client";

import { useEffect } from "react";

// Registers the service worker in production only (avoids interfering with
// dev HMR). Needs a secure context (HTTPS / localhost) to take effect.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;
    // A phone left on the home screen for days keeps whatever worker it had.
    // Checking on focus and hourly means a deploy is picked up on its own —
    // the new worker calls skipWaiting, and StuckRecovery reloads once when it
    // takes control.
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible") return;
      reg?.update().catch(() => {});
      void warm();
    };
    /**
     * Ask the worker to save the driver's screens while there is still signal.
     *
     * Caching only what the driver happened to open meant "available offline"
     * was really "available if you opened it online first" — and a driver
     * leaving the yard has not. Warming is repeated on focus because a deploy
     * or a sign-in changes what should be stored.
     */
    const warm = async () => {
      if (!navigator.onLine) return;
      const active = (await navigator.serviceWorker.ready.catch(() => null))?.active
        ?? navigator.serviceWorker.controller;
      active?.postMessage({ type: "warm" });
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((r) => {
          reg = r;
          document.addEventListener("visibilitychange", checkForUpdate);
          window.setInterval(checkForUpdate, 60 * 60 * 1000);
          void warm();
        })
        .catch(() => {
          /* registration failures are non-fatal */
        });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
