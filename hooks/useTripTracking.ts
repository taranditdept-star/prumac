"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { bufferPings, drainBufferForTrip, bufferedCountForTrip } from "@/lib/gps/buffer";

interface SamplePing {
  trip_id: string;
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kph?: number | null;
  heading_deg?: number | null;
  accuracy_m?: number | null;
  altitude_m?: number | null;
  battery_pct?: number | null;
}

export type TrackingState =
  | "idle"
  | "requesting"
  | "tracking"
  | "denied"
  | "error"
  | "insecure"
  | "unsupported";

interface UseTripTrackingOptions {
  tripId: string;
  enabled: boolean;
  /** Send buffered batch every N seconds (default 30). */
  flushSeconds?: number;
}

interface UseTripTrackingResult {
  state: TrackingState;
  pingsBuffered: number;
  pingsSent: number;
  lastError: string | null;
  lastSyncAt: Date | null;
  isOnline: boolean;
  flushNow: () => Promise<void>;
  retry: () => void;
}

export function useTripTracking({
  tripId,
  enabled,
  flushSeconds = 30,
}: UseTripTrackingOptions): UseTripTrackingResult {
  const [state, setState] = useState<TrackingState>("idle");
  const [pingsBuffered, setPingsBuffered] = useState(0);
  const [pingsSent, setPingsSent] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const [retryNonce, setRetryNonce] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const retry = useCallback(() => {
    setLastError(null);
    setState("requesting");
    setRetryNonce((n) => n + 1);
  }, []);

  const flushNow = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const buffered = await drainBufferForTrip(tripId);
      if (buffered.length === 0) {
        setPingsBuffered(0);
        return;
      }
      if (!navigator.onLine) {
        // Re-buffer; we'll try again later
        await bufferPings(buffered);
        setPingsBuffered(await bufferedCountForTrip(tripId));
        return;
      }
      const res = await fetch("/api/gps/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          pings: buffered.map((p) => ({
            recorded_at: p.recorded_at,
            lat: p.lat,
            lng: p.lng,
            speed_kph: p.speed_kph ?? null,
            heading_deg: p.heading_deg ?? null,
            accuracy_m: p.accuracy_m ?? null,
            altitude_m: p.altitude_m ?? null,
            battery_pct: p.battery_pct ?? null,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Network error" }));
        // Re-buffer for retry
        await bufferPings(buffered);
        setLastError(err.error ?? `HTTP ${res.status}`);
      } else {
        const out = (await res.json()) as { recorded?: number };
        setPingsSent((n) => n + (out.recorded ?? buffered.length));
        setLastSyncAt(new Date());
        setLastError(null);
      }
      setPingsBuffered(await bufferedCountForTrip(tripId));
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      inFlightRef.current = false;
    }
  }, [tripId]);

  // Online / offline events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => {
      setIsOnline(true);
      flushNow();
    };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flushNow]);

  // GPS watch + flush timer
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }
    // Geolocation is only available in a secure context (HTTPS / localhost).
    // Over plain HTTP (e.g. a phone hitting the LAN IP) the browser reports
    // PERMISSION_DENIED even though the user never denied — flag it clearly.
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setState("insecure");
      setLastError("GPS needs a secure (HTTPS) connection.");
      return;
    }

    setState("requesting");

    const onPos = async (pos: GeolocationPosition) => {
      setState("tracking");
      const ping: SamplePing = {
        trip_id: tripId,
        recorded_at: new Date(pos.timestamp).toISOString(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kph:
          pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6 * 100) / 100 : null,
        heading_deg:
          pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading * 100) / 100
            : null,
        accuracy_m:
          pos.coords.accuracy != null ? Math.round(pos.coords.accuracy * 100) / 100 : null,
        altitude_m: pos.coords.altitude ?? null,
        battery_pct: null,
      };
      await bufferPings([ping]);
      setPingsBuffered(await bufferedCountForTrip(tripId));
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setState("denied");
      else setState("error");
      setLastError(err.message);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 30_000,
    });

    flushTimerRef.current = setInterval(() => {
      flushNow();
    }, flushSeconds * 1000);

    // Kick off an immediate flush of anything already buffered
    flushNow();

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      // Final flush attempt on stop
      flushNow();
    };
  }, [enabled, tripId, flushSeconds, flushNow, retryNonce]);

  return {
    state,
    pingsBuffered,
    pingsSent,
    lastError,
    lastSyncAt,
    isOnline,
    flushNow,
    retry,
  };
}
