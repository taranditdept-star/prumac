"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Always-on driver live location.
 *
 * Mounted once in the driver layout, so it runs on EVERY driver screen the
 * moment they log in — no "Start trip", no "Manage trip", no "Sync now". A
 * single geolocation watch streams the driver's position to head office every
 * ~12s. The server (fn_record_driver_location) figures out which trip/vehicle
 * the driver is on; the client just sends lat/lng/speed.
 *
 * This is independent of the per-trip GPS trail (GpsTracker / trip_locations),
 * which still records the reconciliation audit track during a trip.
 */

export type LocationPermission =
  | "unsupported" // no geolocation API
  | "insecure" // not a secure context (plain http) → browser blocks GPS
  | "prompt" // not yet decided / awaiting the native dialog
  | "granted"
  | "denied"
  | "error";

interface LiveLocationValue {
  permission: LocationPermission;
  isOnline: boolean;
  /** A position has been sent to head office at least once this session. */
  isLive: boolean;
  lastSentAt: Date | null;
  pending: boolean; // a fix is waiting to send (offline / in flight)
  lastError: string | null;
  /** User gesture to (re)request permission and (re)start the watch. */
  enable: () => void;
}

const LiveLocationContext = createContext<LiveLocationValue | null>(null);

export function useLiveLocation(): LiveLocationValue {
  const ctx = useContext(LiveLocationContext);
  if (!ctx) {
    throw new Error("useLiveLocation must be used within <LiveLocationProvider>");
  }
  return ctx;
}

// How often we push the latest fix to the server (decoupled from how often the
// GPS hardware reports). 12s keeps the live map fresh without hammering a
// possibly-slow mobile connection.
const SEND_INTERVAL_MS = 12_000;

interface LatestFix {
  lat: number;
  lng: number;
  speed_kph: number | null;
  heading_deg: number | null;
  accuracy_m: number | null;
  battery_pct: number | null;
}

export function LiveLocationProvider({ children }: { children: React.ReactNode }) {
  const [permission, setPermission] = useState<LocationPermission>("prompt");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isLive, setIsLive] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const latestRef = useRef<LatestFix | null>(null);
  const unsentRef = useRef(false); // latest fix not yet delivered
  const inFlightRef = useRef(false);
  const batteryRef = useRef<number | null>(null);

  const send = useCallback(async () => {
    const fix = latestRef.current;
    if (!fix || !unsentRef.current) return;
    if (inFlightRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPending(true);
      return;
    }
    inFlightRef.current = true;
    try {
      const supabase = createClient();
      const { error } = await supabase.schema("app").rpc("fn_record_driver_location", {
        p_lat: fix.lat,
        p_lng: fix.lng,
        p_speed_kph: fix.speed_kph,
        p_heading_deg: fix.heading_deg,
        p_accuracy_m: fix.accuracy_m,
        p_battery_pct: fix.battery_pct,
      });
      if (error) {
        setLastError(error.message);
        setPending(true);
      } else {
        unsentRef.current = false;
        setIsLive(true);
        setLastSentAt(new Date());
        setLastError(null);
        setPending(false);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : "Could not send location");
      setPending(true);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const enable = useCallback(() => {
    setLastError(null);
    setPermission("prompt");
    setNonce((n) => n + 1);
    // A direct one-shot request inside the user gesture maximises the chance the
    // browser shows the native prompt (esp. after a prior dismiss).
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setPermission("granted"),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setPermission("denied");
        },
        { enableHighAccuracy: true, timeout: 20_000 },
      );
    }
  }, []);

  // Best-effort battery level (Chrome/Android). Silent where unsupported.
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number }>;
    };
    nav.getBattery?.()
      .then((b) => {
        batteryRef.current = Math.round(b.level * 100);
      })
      .catch(() => {});
  }, []);

  // Online / offline — flush the latest fix as soon as we're back online.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => {
      setIsOnline(true);
      send();
    };
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [send]);

  // Reflect the OS permission state (where the Permissions API exists) so the
  // banner can stay accurate even if the user changes it in browser settings.
  useEffect(() => {
    const perms = navigator.permissions;
    if (!perms?.query) return;
    let status: PermissionStatus | null = null;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        const apply = () =>
          setPermission((prev) =>
            prev === "unsupported" || prev === "insecure"
              ? prev
              : (s.state as LocationPermission),
          );
        apply();
        s.onchange = apply;
      })
      .catch(() => {});
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // The geolocation watch + periodic send. Restarts when `enable()` bumps nonce.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermission("unsupported");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      // Plain http (e.g. phone on the LAN IP) — the browser refuses GPS.
      setPermission("insecure");
      setLastError("Location needs a secure (https) connection.");
      return;
    }

    const onPos = (pos: GeolocationPosition) => {
      setPermission("granted");
      latestRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kph:
          pos.coords.speed != null && !Number.isNaN(pos.coords.speed)
            ? Math.round(pos.coords.speed * 3.6 * 100) / 100
            : null,
        heading_deg:
          pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading * 100) / 100
            : null,
        accuracy_m:
          pos.coords.accuracy != null ? Math.round(pos.coords.accuracy * 100) / 100 : null,
        battery_pct: batteryRef.current,
      };
      unsentRef.current = true;
    };

    const onErr = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setPermission("denied");
      else setPermission("error");
      setLastError(err.message);
    };

    // Starting the watch is what triggers the native "Allow location?" prompt
    // automatically right after login.
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 30_000,
    });
    watchIdRef.current = watchId;

    // Send the very first fix promptly, then on a steady cadence.
    const kick = setTimeout(() => void send(), 2_000);
    const interval = setInterval(() => void send(), SEND_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(kick);
      clearInterval(interval);
    };
  }, [send, nonce]);

  const value: LiveLocationValue = {
    permission,
    isOnline,
    isLive,
    lastSentAt,
    pending,
    lastError,
    enable,
  };

  return (
    <LiveLocationContext.Provider value={value}>{children}</LiveLocationContext.Provider>
  );
}
