"use client";

import { useEffect, useState } from "react";

/**
 * The offline screen used to offer "Open the app" unconditionally, and on a
 * phone that had never saved its pages the button did nothing at all — you tap
 * it, the worker finds no cached page, and it lands straight back here.
 *
 * So look first. If the driver's screens really are saved, offer to open them.
 * If they are not, say so and explain the one thing that fixes it, instead of
 * offering a button that cannot work.
 */
type State = "checking" | "ready" | "not-saved";

const btn: React.CSSProperties = {
  display: "block", height: 52, lineHeight: "52px", borderRadius: 16,
  fontSize: 16, fontWeight: 700, textDecoration: "none", textAlign: "center",
};

export function OfflineActions() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Is the driver's home screen actually available on this phone?
        const hit = await caches.match("/home");
        if (alive) setState(hit ? "ready" : "not-saved");
      } catch {
        if (alive) setState("not-saved");
      }
      // If signal has quietly come back, ask the worker to save them now.
      if (navigator.onLine) {
        const reg = await navigator.serviceWorker?.ready.catch(() => null);
        reg?.active?.postMessage({ type: "warm" });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state === "checking") {
    return <div style={{ ...btn, background: "rgba(255,255,255,.08)", color: "#64748b" }}>Checking…</div>;
  }

  if (state === "ready") {
    return (
      <>
        <a href="/home" style={{ ...btn, background: "#f97316", color: "#fff" }}>
          Open the app
        </a>
        <a
          href="/offline"
          style={{
            ...btn, height: 46, lineHeight: "46px", marginTop: 10, background: "transparent",
            border: "1px solid rgba(255,255,255,.18)", color: "#cbd5e1", fontSize: 15, fontWeight: 600,
          }}
        >
          Try the connection again
        </a>
      </>
    );
  }

  return (
    <>
      <p
        style={{
          margin: "0 0 16px", padding: "12px 14px", borderRadius: 14,
          background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.3)",
          color: "#fdba74", fontSize: 13, lineHeight: 1.55, textAlign: "left",
        }}
      >
        This phone hasn&rsquo;t saved your screens yet. Open PRUMAC once where there is signal —
        even for a few seconds — and it will work without a connection from then on.
      </p>
      <a href="/offline" style={{ ...btn, background: "#f97316", color: "#fff" }}>
        Try the connection again
      </a>
    </>
  );
}
