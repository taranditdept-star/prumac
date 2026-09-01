"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { flush, pending } from "@/lib/offline/outbox";

/**
 * Tells a driver where their work is.
 *
 * Without this, working offline is an act of faith: you fill in the odometer,
 * nothing visibly happens, and you have no idea whether the office got it. The
 * bar says how many items are waiting and clears itself once they land.
 */
export function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  const refresh = useCallback(async () => {
    setQueued((await pending()).length);
  }, []);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await flush();
      setQueued(r.remaining);
      if (r.sent > 0 && r.remaining === 0) {
        setJustSynced(true);
        window.setTimeout(() => setJustSynced(false), 4000);
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();

    const goOnline = () => { setOnline(true); void sync(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Signal comes back in patches on the road, and the browser's online event
    // is optimistic — it fires on any network, not on a working one. So retry
    // on a timer as well.
    const timer = window.setInterval(() => { if (navigator.onLine) void sync(); }, 60_000);
    if (navigator.onLine) void sync();

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  if (online && queued === 0 && !justSynced) return null;

  if (justSynced) {
    return (
      <div className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">
        <Check className="h-4 w-4" /> Everything has been sent to the office
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold text-white ${
        online ? "bg-amber-600" : "bg-ink-800"
      }`}
    >
      <span className="flex items-center gap-2">
        <CloudOff className="h-4 w-4 shrink-0" />
        {online
          ? `${queued} item${queued === 1 ? "" : "s"} waiting to send`
          : queued > 0
            ? `No signal — ${queued} item${queued === 1 ? "" : "s"} saved on this phone`
            : "No signal — your work will be saved on this phone"}
      </span>
      {online && queued > 0 && (
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sending…" : "Send now"}
        </button>
      )}
    </div>
  );
}
