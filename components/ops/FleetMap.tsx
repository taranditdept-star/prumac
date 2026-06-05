"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createClient } from "@/lib/supabase/client";
import type { CountryCode, TripStatus } from "@/types/domain";

export interface FleetPosition {
  trip_id: string;
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  driver_name: string | null;
  trip_status: TripStatus;
  lat: number;
  lng: number;
  speed_kph: number | null;
  heading_deg: number | null;
  recorded_at: string;
  seconds_old: number;
}

interface FleetMapProps {
  initial: FleetPosition[];
  token: string | null;
  onSelect?: (p: FleetPosition | null) => void;
  selectedTripId?: string | null;
}

const ZW_CENTER: [number, number] = [29.83, -19.02];

function markerColor(p: FleetPosition): string {
  if (p.trip_status === "paused") return "#f59e0b";
  if (p.seconds_old > 300) return "#ef4444";   // stale > 5 min
  if (p.speed_kph != null && p.speed_kph > 5) return "#10b981"; // moving
  return "#0ea5e9"; // idle
}

export function FleetMap({ initial, token, onSelect, selectedTripId }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [positions, setPositions] = useState<FleetPosition[]>(initial);
  const [tokenError, setTokenError] = useState(false);

  // Initialise Mapbox
  useEffect(() => {
    if (!token || !containerRef.current) return;
    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: ZW_CENTER,
        zoom: 6,
        pitch: 30,
      });
      mapRef.current = map;
    } catch {
      setTokenError(true);
      return;
    }

    map.on("error", (e) => {
      const err = e.error as { status?: number; message?: string } | undefined;
      // Surface map errors so a blank map is diagnosable from the console.
      console.error("[FleetMap] mapbox error:", err?.message ?? e);
      if (err?.status === 401 || err?.status === 403) setTokenError(true);
    });

    map.on("load", () => {
      map.resize();
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    });

    // Mapbox renders blank if its container wasn't fully sized when the map was
    // created (common inside grid/flex layouts). Force a resize once the layout
    // settles and whenever the container changes size.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    const raf = requestAnimationFrame(() => map.resize());

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Render markers
  const renderMarkers = useCallback(
    (pts: FleetPosition[]) => {
      const map = mapRef.current;
      if (!map) return;
      const existing = markersRef.current;
      const seen = new Set<string>();

      for (const p of pts) {
        seen.add(p.trip_id);
        const lngLat: [number, number] = [p.lng, p.lat];
        if (existing.has(p.trip_id)) {
          existing.get(p.trip_id)!.setLngLat(lngLat);
        } else {
          const el = document.createElement("div");
          el.className = "fleet-marker";
          el.style.cssText = `
            width: 22px; height: 22px; border-radius: 50%;
            background: ${markerColor(p)};
            border: 3px solid white;
            box-shadow: 0 0 0 2px rgba(15,23,42,0.4), 0 4px 10px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: transform 0.2s ease;
          `;
          el.onmouseenter = () => (el.style.transform = "scale(1.15)");
          el.onmouseleave = () => (el.style.transform = "scale(1)");
          el.onclick = () => onSelect?.(p);

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(lngLat)
            .addTo(map);
          existing.set(p.trip_id, marker);
        }

        // Update colour on existing
        const el = existing.get(p.trip_id)?.getElement();
        if (el) el.style.background = markerColor(p);
      }

      // Remove markers no longer present
      for (const [id, marker] of existing) {
        if (!seen.has(id)) {
          marker.remove();
          existing.delete(id);
        }
      }

      // Fit bounds if more than one
      if (pts.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds();
        pts.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 800 });
      } else if (pts.length === 1) {
        map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 11, duration: 800 });
      }
    },
    [onSelect],
  );

  // When positions change, render
  useEffect(() => {
    renderMarkers(positions);
  }, [positions, renderMarkers]);

  // Highlight selected marker
  useEffect(() => {
    markersRef.current.forEach((marker, tripId) => {
      const el = marker.getElement();
      if (tripId === selectedTripId) {
        el.style.transform = "scale(1.4)";
        el.style.boxShadow =
          "0 0 0 3px rgba(255,90,31,0.6), 0 0 20px rgba(255,90,31,0.4), 0 4px 12px rgba(0,0,0,0.4)";
      } else {
        el.style.transform = "scale(1)";
        el.style.boxShadow = "0 0 0 2px rgba(15,23,42,0.4), 0 4px 10px rgba(0,0,0,0.3)";
      }
    });
  }, [selectedTripId]);

  // Realtime subscription — refresh position on new ping
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("fleet-positions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "app", table: "trip_locations" },
        async () => {
          // Re-fetch the snapshot for this trip via RPC for simplicity
          const { data } = await supabase
            .schema("app")
            .rpc("fn_live_fleet_positions");
          if (Array.isArray(data)) setPositions(data as FleetPosition[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (tokenError) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 border border-ink-800 h-[600px] flex items-center justify-center text-center px-6">
        <div className="max-w-md">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-rose-500/20 items-center justify-center mb-3">
            <span className="text-2xl">🛰️</span>
          </div>
          <p className="text-base font-bold text-white">Mapbox token is invalid</p>
          <p className="text-sm text-slate-400 mt-2">
            The Mapbox access token in <code className="text-orange-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> was
            rejected. Sign up at <span className="text-sky-400">mapbox.com</span> for a free token and update
            your <code className="text-orange-400">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 border border-ink-800 h-[600px] flex items-center justify-center text-center px-6">
        <div className="max-w-md">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-orange-500/20 items-center justify-center mb-3">
            <span className="text-2xl">🗺️</span>
          </div>
          <p className="text-base font-bold text-white">Map not configured</p>
          <p className="text-sm text-slate-400 mt-2">
            Add a Mapbox access token to <code className="text-orange-400">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in your <code className="text-orange-400">.env.local</code> to enable the live fleet map.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Free tier covers up to 50,000 map loads / month at{" "}
            <span className="text-sky-400">mapbox.com</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-ink-800 h-[600px] bg-ink-900">
      <div ref={containerRef} className="absolute inset-0" />
      {positions.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl bg-ink-950/80 backdrop-blur px-5 py-4 border border-white/10 text-center">
            <p className="text-sm font-semibold text-white">No vehicles moving right now</p>
            <p className="text-xs text-slate-400 mt-1">
              When a driver starts a trip, they&apos;ll appear here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
