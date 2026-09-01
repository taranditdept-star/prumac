"use client";

import { useEffect, useState } from "react";

/**
 * The offline screen used to offer "Open the app" unconditionally, and on a
 * phone that had never saved its pages the button did nothing at all — you tap
 * it, the worker finds no cached page, and it lands straight back here.
 *
 * So look first, and say something true for the situation the driver is
 * actually in. There are three:
 *
 *   nothing saved — explain the one thing that fixes it, and offer no button
 *                   that cannot work.
 *   in the app    — they tapped a screen this phone never saved. Point them
 *                   back to what it did save, rather than to "the app", which
 *                   they are already inside.
 *   at the door   — the app was launched with no signal. Open it.
 */
type State = "checking" | "ready" | "not-saved";

const btn: React.CSSProperties = {
  display: "block", height: 52, lineHeight: "52px", borderRadius: 16,
  fontSize: 16, fontWeight: 700, textDecoration: "none", textAlign: "center",
};
const ghost: React.CSSProperties = {
  ...btn, height: 46, lineHeight: "46px", marginTop: 10, background: "transparent",
  border: "1px solid rgba(255,255,255,.18)", color: "#cbd5e1", fontSize: 15, fontWeight: 600,
};
const note: React.CSSProperties = {
  fontSize: 14, lineHeight: 1.6, color: "#94a3b8", margin: "0 0 24px",
};

export function OfflineActions() {
  const [state, setState] = useState<State>("checking");
  const [fromInside, setFromInside] = useState(false);

  useEffect(() => {
    let alive = true;
    setFromInside(document.referrer.startsWith(window.location.origin));
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
        reg?.active?.postMessage({ type: "warm", force: true });
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
        <p style={note}>
          {fromInside
            ? "That screen isn’t saved on this phone. The ones that are still work — your trip, checklist and handover will send to the office as soon as the signal returns."
            : "Your saved screens still work without a connection. Anything you fill in is kept on this phone and sent to the office as soon as the signal returns."}
        </p>
        <a href="/home" style={{ ...btn, background: "#f97316", color: "#fff" }}>
          {fromInside ? "Back to my home screen" : "Open the app"}
        </a>
        <a href="/offline" style={ghost}>
          Try the connection again
        </a>
      </>
    );
  }

  return (
    <>
      <p style={note}>
        PRUMAC Connect needs a connection to load your trips, checklists and messages. Your
        location is still being recorded on this phone and will sync when the signal returns.
      </p>
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
