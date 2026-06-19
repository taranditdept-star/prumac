"use client";

import { MapPin, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLiveLocation } from "./LiveLocationProvider";

/**
 * Sits at the top of the driver app. The native permission prompt is fired
 * automatically by the provider on login; this banner is the visible, tappable
 * fallback for when location is still pending, blocked or unavailable — and a
 * brief "you're live" confirmation once it's flowing.
 */
export function LocationPermissionBanner() {
  const { permission, isLive, lastError, enable } = useLiveLocation();
  const [showLive, setShowLive] = useState(false);

  // Flash a confirmation the first time location starts flowing, then fade it.
  useEffect(() => {
    if (permission === "granted" && isLive) {
      setShowLive(true);
      const t = setTimeout(() => setShowLive(false), 6_000);
      return () => clearTimeout(t);
    }
  }, [permission, isLive]);

  // Granted + already confirmed → stay out of the way entirely.
  if (permission === "granted" && !showLive) return null;

  if (permission === "granted" && showLive) {
    return (
      <Bar tone="emerald">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium">
          Location is on — head office can see you live.
        </p>
      </Bar>
    );
  }

  if (permission === "prompt") {
    return (
      <Bar tone="sky">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <p className="text-xs font-medium flex-1">
          Allow location so head office can track your trip live.
        </p>
        <Action onClick={enable}>Allow</Action>
      </Bar>
    );
  }

  if (permission === "denied") {
    return (
      <Bar tone="rose">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium flex-1">
          Location is blocked. Allow it for this site in your browser settings, then tap Retry.
        </p>
        <Action onClick={enable}>Retry</Action>
      </Bar>
    );
  }

  if (permission === "insecure") {
    return (
      <Bar tone="rose">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium flex-1">
          Open the app over <b>https://</b> or install it to your home screen to enable live location.
        </p>
      </Bar>
    );
  }

  if (permission === "unsupported") {
    return (
      <Bar tone="rose">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium flex-1">
          This device can&apos;t share GPS location.
        </p>
      </Bar>
    );
  }

  // permission === "error"
  return (
    <Bar tone="amber">
      <MapPin className="h-4 w-4 shrink-0" />
      <p className="text-xs font-medium flex-1">
        {lastError ?? "Couldn't get your location."}
      </p>
      <Action onClick={enable}>Retry</Action>
    </Bar>
  );
}

function Bar({
  tone,
  children,
}: {
  tone: "sky" | "emerald" | "amber" | "rose";
  children: React.ReactNode;
}) {
  const toneClass = {
    sky: "bg-sky-50 text-sky-800 border-sky-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
  }[tone];
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 border-b ${toneClass}`}>
      {children}
    </div>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-lg bg-white/70 hover:bg-white px-3 py-1 text-xs font-bold transition-colors"
    >
      {children}
    </button>
  );
}
