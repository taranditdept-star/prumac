"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Maximize2, Radio, Users, Gauge, ArrowUpRight, MapPin, Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FleetMap, type FleetPosition } from "./FleetMap";
import { AlertsPanel, type AlertRow } from "./AlertsPanel";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";

interface LiveOpsCommandCenterProps {
  initialPositions: FleetPosition[];
  initialAlerts: AlertRow[];
  mapboxToken: string | null;
}

function statusOf(p: FleetPosition): "moving" | "idle" | "stale" | "paused" {
  if (p.trip_status === "paused") return "paused";
  if (p.seconds_old > 300) return "stale";
  if (p.speed_kph != null && p.speed_kph > 5) return "moving";
  return "idle";
}

export function LiveOpsCommandCenter({
  initialPositions,
  initialAlerts,
  mapboxToken,
}: LiveOpsCommandCenterProps) {
  const [positions, setPositions] = useState<FleetPosition[]>(initialPositions);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Refresh "seconds_old" view every 15s so cards drift through Moving → Idle → Stale
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);

  // Subscribe to fleet positions
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("fleet-positions-summary")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "app", table: "trip_locations" },
        async () => {
          const { data } = await supabase.schema("app").rpc("fn_live_fleet_positions");
          if (Array.isArray(data)) setPositions(data as FleetPosition[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const summary = {
    total: positions.length,
    moving: positions.filter((p) => statusOf(p) === "moving").length,
    idle: positions.filter((p) => statusOf(p) === "idle").length,
    stale: positions.filter((p) => statusOf(p) === "stale").length,
    paused: positions.filter((p) => statusOf(p) === "paused").length,
  };

  const selected = positions.find((p) => p.trip_id === selectedTripId) ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6">
      {/* Main: map + status strip */}
      <div className="xl:col-span-9 space-y-4">
        {/* Status strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 rounded-full bg-white border border-ink-200 px-3 py-1.5 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-800">Live</span>
          </div>
          <Pill icon={Radio} label="Active trips" value={summary.total} tone="brand" />
          <Pill icon={Activity} label="Moving" value={summary.moving} tone="emerald" />
          <Pill icon={Gauge} label="Idle" value={summary.idle} tone="sky" />
          {summary.paused > 0 && (
            <Pill icon={Activity} label="Paused" value={summary.paused} tone="amber" />
          )}
          {summary.stale > 0 && (
            <Pill icon={Activity} label="Stale" value={summary.stale} tone="rose" />
          )}
        </div>

        {/* Map */}
        <FleetMap
          initial={initialPositions}
          token={mapboxToken}
          onSelect={(p) => setSelectedTripId(p?.trip_id ?? null)}
          selectedTripId={selectedTripId}
        />

        {/* Active vehicles strip below map */}
        <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-ink-900">Active trips</h3>
              <p className="text-xs text-ink-500 mt-0.5">{positions.length} on the road</p>
            </div>
            <Link
              href="/trips"
              className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1"
            >
              All trips <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {positions.length === 0 ? (
            <p className="text-sm text-ink-500 italic text-center py-6">
              No active trips. Vehicles will appear here once a trip starts.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {positions.map((p) => {
                const isSelected = p.trip_id === selectedTripId;
                const st = statusOf(p);
                const stColor = {
                  moving: "bg-emerald-500",
                  idle: "bg-sky-500",
                  paused: "bg-amber-500",
                  stale: "bg-rose-500",
                }[st];
                return (
                  <button
                    key={p.trip_id}
                    type="button"
                    onClick={() => setSelectedTripId(isSelected ? null : p.trip_id)}
                    className={`text-left rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-orange-300 bg-orange-50 ring-2 ring-orange-200"
                        : "border-ink-200 hover:border-orange-200 hover:bg-orange-50/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <PlateBadge plate={p.plate_number} country={p.plate_country} size="sm" />
                      <span className={`h-2 w-2 rounded-full ${stColor}`} />
                    </div>
                    <p className="text-xs font-semibold text-ink-900 truncate">
                      {p.make} {p.model}
                    </p>
                    <p className="text-[11px] text-ink-500 truncate mt-0.5">
                      {p.driver_name ?? "—"}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-xs font-bold text-ink-900 font-plate">
                        {p.speed_kph != null ? `${Math.round(p.speed_kph)} km/h` : "—"}
                      </span>
                      <span className="text-[10px] text-ink-400">{ago(p.recorded_at, now)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side: selected vehicle detail + alerts panel */}
      <aside className="xl:col-span-3 space-y-4">
        {selected ? (
          <SelectedVehicleCard p={selected} now={now} />
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 text-white p-5 shadow-lg shadow-orange-500/30 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <Maximize2 className="h-5 w-5 text-orange-100 mb-3" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-orange-100 font-bold">
              Command centre
            </p>
            <p className="text-sm font-semibold mt-1 leading-snug">
              Click any vehicle on the map or in the strip below to focus on it.
            </p>
            <p className="text-xs text-orange-100/80 mt-3 leading-relaxed">
              Markers refresh in real time as drivers&apos; phones report new GPS positions.
            </p>
          </div>
        )}

        <div className="h-[600px]">
          <AlertsPanel initial={initialAlerts} />
        </div>
      </aside>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "brand" | "emerald" | "sky" | "amber" | "rose";
}) {
  const t = {
    brand: "text-orange-600",
    emerald: "text-emerald-600",
    sky: "text-sky-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
  }[tone];
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white border border-ink-200 px-3 py-1.5 shadow-sm">
      <Icon className={`h-3.5 w-3.5 ${t}`} />
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500 font-bold">{label}</span>
      <span className={`text-sm font-bold tabular ${t}`}>{value}</span>
    </div>
  );
}

function SelectedVehicleCard({ p, now }: { p: FleetPosition; now: number }) {
  const st = statusOf(p);
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className="flex items-center justify-between mb-3">
        <PlateBadge plate={p.plate_number} country={p.plate_country} />
        <TripStatusBadge status={p.trip_status} />
      </div>
      <p className="text-base font-bold text-ink-900">
        {p.make} {p.model}
      </p>
      <p className="text-xs text-ink-500 mt-0.5 inline-flex items-center gap-1.5">
        <Users className="h-3 w-3" />
        {p.driver_name ?? "Unknown driver"}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Speed" value={p.speed_kph != null ? `${Math.round(p.speed_kph)}` : "—"} unit="km/h" />
        <Metric label="Last ping" value={ago(p.recorded_at, now)} unit="" />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2">
        <MapPin className="h-3.5 w-3.5 text-ink-400 shrink-0" />
        <p className="text-[11px] text-ink-600 font-plate truncate">
          {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
        </p>
        <span className={`ml-auto h-2 w-2 rounded-full ${
          st === "moving" ? "bg-emerald-500" :
          st === "idle" ? "bg-sky-500" :
          st === "paused" ? "bg-amber-500" : "bg-rose-500"
        }`} />
      </div>

      <Link
        href={`/trips/${p.trip_id}`}
        className="mt-4 flex items-center justify-center gap-2 h-10 rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-sm font-semibold transition-colors"
      >
        Open trip
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-lg font-bold text-ink-900 tabular mt-1 font-plate">
        {value}
        {unit && <span className="text-[10px] text-ink-400 ml-1 font-sans">{unit}</span>}
      </p>
    </div>
  );
}

function ago(iso: string, now: number): string {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
