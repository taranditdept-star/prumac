"use client";

import { useMemo } from "react";

interface TrailPoint {
  lat: number;
  lng: number;
  speed_kph: number | null;
  accuracy_m: number | null;
  recorded_at: string;
}

interface GpsTrailMapProps {
  points: TrailPoint[];
  height?: number;
}

/**
 * Lightweight SVG trail viewer.
 * Projects lat/lng to fit-to-bounds 2D coordinates (no real Mercator —
 * fine for short trips). Mapbox tiles arrive in Phase 7.
 */
export function GpsTrailMap({ points, height = 320 }: GpsTrailMapProps) {
  const computed = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padLat = (maxLat - minLat) * 0.1 || 0.0005;
    const padLng = (maxLng - minLng) * 0.1 || 0.0005;
    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
    };
  }, [points]);

  if (!computed || points.length === 0) {
    return (
      <div
        className="rounded-2xl bg-gradient-to-br from-ink-50 to-ink-100 border border-ink-200 flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center px-6">
          <p className="text-sm font-semibold text-ink-700">No GPS data</p>
          <p className="text-xs text-ink-500 mt-1">
            No location pings were recorded for this trip.
          </p>
        </div>
      </div>
    );
  }

  const w = 800;
  const h = 400;
  const { minLat, maxLat, minLng, maxLng } = computed;

  const project = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * w;
    const y = h - ((lat - minLat) / (maxLat - minLat)) * h;
    return { x, y };
  };

  const projected = points.map((p) => ({ ...project(p.lat, p.lng), speed: p.speed_kph }));
  const path = projected.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const start = projected[0];
  const end = projected[projected.length - 1];

  return (
    <div
      className="rounded-2xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 border border-ink-800 overflow-hidden relative"
      style={{ height }}
    >
      {/* Subtle grid overlay */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <pattern id="trailGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
          </pattern>
          <linearGradient id="trailLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#ff5a1f" />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill="url(#trailGrid)" />

        {/* Path */}
        <path
          d={path}
          fill="none"
          stroke="url(#trailLine)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Intermediate points */}
        {projected.slice(1, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill="#94a3b8" opacity={0.4} />
        ))}

        {/* Start marker (green) */}
        <circle cx={start.x} cy={start.y} r="9" fill="#10b981" stroke="white" strokeWidth="2" />
        <text x={start.x + 14} y={start.y + 4} fill="white" fontSize="11" fontWeight="700">
          START
        </text>

        {/* End marker (orange) */}
        <circle cx={end.x} cy={end.y} r="9" fill="#ff5a1f" stroke="white" strokeWidth="2" />
        <text x={end.x + 14} y={end.y + 4} fill="white" fontSize="11" fontWeight="700">
          END
        </text>
      </svg>

      {/* Footer */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] font-bold text-slate-400">
        <span>GPS trail · {points.length} pings</span>
        <span>
          {points[0]?.recorded_at && new Date(points[0].recorded_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          {" → "}
          {points[points.length - 1]?.recorded_at &&
            new Date(points[points.length - 1].recorded_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
