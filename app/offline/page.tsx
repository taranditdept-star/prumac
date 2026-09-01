import { WifiOff } from "lucide-react";

/**
 * The page the service worker falls back to when the device is offline.
 *
 * Three rules, each learned the hard way:
 *
 *   1. It must be STATIC and must never redirect. The worker previously
 *      precached "/", which is a 307 to /login or /home — a redirected response
 *      cannot be served back for a navigation, so the browser aborted with
 *      ERR_FAILED and the app would not open at all without a connection.
 *
 *   2. It must not depend on a JavaScript chunk. When this page used a client
 *      component, a phone whose chunks were missing showed "The app didn't
 *      load" — the crash screen, on the page whose whole job is to explain a
 *      crash. The logic below is inline in the HTML for that reason.
 *
 *   3. What it says has to be true for the phone reading it. A phone with
 *      nothing saved must not be offered a button that cannot work, so the
 *      cautious version renders by default and the script only upgrades it
 *      after confirming the driver's home screen really is stored.
 */
export const dynamic = "force-static";

export const metadata = { title: "Offline — PRUMAC Connect" };

const BOOT = `(function(){
  var saved = document.getElementById("prumac-saved");
  var none  = document.getElementById("prumac-none");
  var open  = document.getElementById("prumac-open");
  var lead  = document.getElementById("prumac-lead");
  try {
    if (document.referrer.indexOf(location.origin) === 0) {
      open.textContent = "Back to my home screen";
      lead.textContent = "That screen isn't saved on this phone. The ones that are still work \\u2014 anything you fill in is kept here and sent to the office as soon as the signal returns.";
    }
  } catch (e) {}
  if (window.caches) {
    caches.match("/home").then(function(hit){
      if (!hit) return;
      none.hidden = true;
      saved.hidden = false;
    }).catch(function(){});
  }
  try {
    if (navigator.onLine && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(function(reg){
        if (reg.active) reg.active.postMessage({ type: "warm", force: true });
      }).catch(function(){});
    }
  } catch (e) {}
})();`;

const btn: React.CSSProperties = {
  display: "block", height: 52, lineHeight: "52px", borderRadius: 16,
  fontSize: 16, fontWeight: 700, textDecoration: "none", textAlign: "center",
};
const ghost: React.CSSProperties = {
  ...btn, height: 46, lineHeight: "46px", marginTop: 10, background: "transparent",
  border: "1px solid rgba(255,255,255,.18)", color: "#cbd5e1", fontSize: 15, fontWeight: 600,
};
const lead: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: "#94a3b8", margin: "0 0 24px" };

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

        {/* Default: assume nothing is saved. A phone that cannot run the script
            below is exactly the phone that should not be promised a working
            button. */}
        <div id="prumac-none">
          <p style={lead}>
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
            This phone hasn&rsquo;t saved your screens yet. Open PRUMAC once where there is signal
            — even for a few seconds — and it will work without a connection from then on.
          </p>
          <a href="/offline" style={{ ...btn, background: "#f97316", color: "#fff" }}>
            Try the connection again
          </a>
        </div>

        <div id="prumac-saved" hidden>
          <p id="prumac-lead" style={lead}>
            Your saved screens still work without a connection. Anything you fill in is kept on
            this phone and sent to the office as soon as the signal returns.
          </p>
          <a id="prumac-open" href="/home" style={{ ...btn, background: "#f97316", color: "#fff" }}>
            Open the app
          </a>
          <a href="/offline" style={ghost}>
            Try the connection again
          </a>
        </div>

        <p style={{ marginTop: 22, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          If you are starting or ending a trip, write the odometer reading down — you can enter it
          once you are back in signal.
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
    </main>
  );
}
