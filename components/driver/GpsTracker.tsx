"use client";

import { Satellite, WifiOff, ShieldAlert, CloudUpload, CircleSlash, RefreshCw } from "lucide-react";
import { useTripTracking } from "@/hooks/useTripTracking";
import type { TripStatus } from "@/types/domain";

interface GpsTrackerProps {
  tripId: string;
  status: TripStatus;
}

export function GpsTracker({ tripId, status }: GpsTrackerProps) {
  // Track only while trip is moving
  const enabled = status === "in_progress";
  const t = useTripTracking({ tripId, enabled });

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StateBadge enabled={enabled} state={t.state} online={t.isOnline} />
          <h3 className="text-sm font-bold text-ink-900">GPS tracking</h3>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-md ${
            t.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {t.isOnline ? "Online" : "Offline"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Sent" value={t.pingsSent} tone="emerald" />
        <Stat label="Pending" value={t.pingsBuffered} tone={t.pingsBuffered > 0 ? "amber" : "ink"} />
        <Stat
          label="Last sync"
          value={t.lastSyncAt ? formatTime(t.lastSyncAt) : "—"}
          tone="sky"
          small
        />
      </div>

      <Message enabled={enabled} state={t.state} online={t.isOnline} error={t.lastError} />

      {enabled && (t.state === "denied" || t.state === "error" || t.state === "insecure") && (
        <button
          type="button"
          onClick={() => t.retry()}
          className="mt-3 w-full h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry GPS
        </button>
      )}

      {(t.pingsBuffered > 0 || t.lastError) && (
        <button
          type="button"
          onClick={() => t.flushNow()}
          className="mt-2 w-full h-9 rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <CloudUpload className="h-3.5 w-3.5" />
          Sync now
        </button>
      )}
    </div>
  );
}

function StateBadge({
  enabled,
  state,
  online,
}: {
  enabled: boolean;
  state: ReturnType<typeof useTripTracking>["state"];
  online: boolean;
}) {
  if (!enabled) {
    return (
      <span className="h-7 w-7 rounded-lg bg-ink-100 text-ink-500 flex items-center justify-center">
        <CircleSlash className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (state === "tracking" && online) {
    return (
      <span className="relative h-7 w-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
        <Satellite className="h-3.5 w-3.5" />
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </span>
    );
  }
  if (state === "tracking" && !online) {
    return (
      <span className="h-7 w-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
        <WifiOff className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (state === "denied" || state === "insecure") {
    return (
      <span className="h-7 w-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
        <ShieldAlert className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="h-7 w-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
      <Satellite className="h-3.5 w-3.5 animate-pulse" />
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string | number;
  tone: "emerald" | "amber" | "sky" | "ink";
  small?: boolean;
}) {
  const t = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    sky: "text-sky-700",
    ink: "text-ink-700",
  }[tone];
  return (
    <div className="rounded-xl bg-ink-50 p-2.5">
      <p className="text-[9px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className={`${small ? "text-sm" : "text-base"} font-bold tabular ${t} mt-0.5`}>
        {value}
      </p>
    </div>
  );
}

function Message({
  enabled,
  state,
  online,
  error,
}: {
  enabled: boolean;
  state: ReturnType<typeof useTripTracking>["state"];
  online: boolean;
  error: string | null;
}) {
  if (!enabled) {
    return (
      <p className="text-xs text-ink-500">
        Tracking pauses while the trip is paused or ended. Resume the trip to continue logging GPS.
      </p>
    );
  }
  if (state === "insecure") {
    return (
      <p className="text-xs text-rose-700">
        GPS needs a secure connection. Open the app over <b>https://</b> or install it to your home
        screen, then tap Retry.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-xs text-rose-700">
        Location is blocked. Allow location for this site in your browser settings, then tap Retry.
      </p>
    );
  }
  if (state === "unsupported") {
    return (
      <p className="text-xs text-rose-700">
        This device does not support GPS. Trip distance will rely on odometer only.
      </p>
    );
  }
  if (!online) {
    return (
      <p className="text-xs text-amber-700">
        You&apos;re offline. GPS pings are being saved on this device and will sync when reception returns.
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-rose-700">{error}</p>;
  }
  if (state === "tracking") {
    return (
      <p className="text-xs text-emerald-700">
        GPS is live. Pings are batched and sent every 30 seconds.
      </p>
    );
  }
  return <p className="text-xs text-ink-500">Requesting GPS permission…</p>;
}

function formatTime(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
