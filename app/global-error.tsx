"use client";

import { useEffect } from "react";

/**
 * Last line of defence. Without this, a crash on boot leaves a driver looking
 * at a white screen with nothing to tap — which is what "the app sticks" looks
 * like from the cab.
 *
 * A stale chunk after a deploy reloads itself once; anything else shows a
 * button, because a silent auto-reload loop would hide a real fault.
 */
const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk [\d]+ failed|Importing a module script failed/i;
const RELOAD_KEY = "prumac:last-recovery-reload";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!CHUNK_ERROR.test(error.message ?? "")) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0, minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#0b1220", color: "#fff", padding: 24,
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif', textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 340 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 18, background: "#f97316",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 18px", fontSize: 28, fontWeight: 800,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
            The app didn&rsquo;t load
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#94a3b8", margin: "0 0 22px" }}>
            This is usually a bad signal. Tap below to try again — nothing you entered has
            been lost.
          </p>
          <button
            type="button"
            onClick={() => { try { reset(); } catch { window.location.reload(); } }}
            style={{
              width: "100%", height: 52, borderRadius: 16, border: "none",
              background: "#f97316", color: "#fff", fontSize: 16, fontWeight: 700,
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%", height: 48, marginTop: 10, borderRadius: 16,
              border: "1px solid rgba(255,255,255,.18)", background: "transparent",
              color: "#cbd5e1", fontSize: 15, fontWeight: 600,
            }}
          >
            Reload the app
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#475569" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
