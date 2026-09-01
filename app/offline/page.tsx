import { WifiOff } from "lucide-react";

/**
 * The page the service worker falls back to when the device is offline.
 *
 * It must be STATIC and must never redirect. The worker previously precached
 * "/", which is a 307 to /login or /home — a redirected response cannot be
 * served back for a navigation, so the browser aborted with ERR_FAILED and the
 * app would not open at all without a connection.
 */
export const dynamic = "force-static";

export const metadata = { title: "Offline — PRUMAC Connect" };

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0b1220", color: "#fff", padding: 24, textAlign: "center",
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 340 }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: 20, background: "rgba(249,115,22,.15)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
          }}
        >
          <WifiOff style={{ width: 30, height: 30, color: "#fb923c" }} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>You&rsquo;re offline</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8", margin: "0 0 24px" }}>
          PRUMAC Connect needs a connection to load your trips, checklists and messages. Your
          location is still being recorded on this phone and will sync when the signal returns.
        </p>

        {/* Goes to /home, not "/". "/" is a redirect, and offline a redirect
            lands straight back here — the button looked broken because it was.
            /home is one of the pages saved for offline use, so this is what
            actually gets a driver into the app with no signal. */}
        <a
          href="/home"
          style={{
            display: "block", height: 52, lineHeight: "52px", borderRadius: 16,
            background: "#f97316", color: "#fff", fontSize: 16, fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Open the app
        </a>
        <a
          href="/offline"
          style={{
            display: "block", height: 46, lineHeight: "46px", marginTop: 10,
            borderRadius: 16, border: "1px solid rgba(255,255,255,.18)",
            color: "#cbd5e1", fontSize: 15, fontWeight: 600, textDecoration: "none",
          }}
        >
          Try the connection again
        </a>

        <p style={{ marginTop: 22, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          If you are starting or ending a trip, write the odometer reading down — you can enter it
          once you are back in signal.
        </p>
      </div>
    </main>
  );
}
