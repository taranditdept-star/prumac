import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Gauge, Fuel, MapPin, Building2, User, Calendar,
  PlayCircle, PauseCircle, StopCircle, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import { TripActions } from "@/components/ops/TripActions";
import { ReconciliationBadge } from "@/components/primitives/ReconciliationBadge";
import type { CountryCode, ReconciliationStatus, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface TripDetail {
  id: string;
  status: TripStatus;
  purpose: string;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  fuel_litres: number | null;
  fuel_amount: number | null;
  fuel_currency: string | null;
  planned_start_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  vehicles: { id: string; plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { id: string; profiles: { full_name: string | null; phone: string | null } | null } | null;
  subsidiaries: { id: string; name: string } | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - new Date(start).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: trip, error } = await supabase
    .schema("app")
    .from("trips")
    .select(`
      *,
      vehicles(id, plate_number, plate_country, make, model),
      drivers(id, profiles(full_name, phone)),
      subsidiaries(id, name)
    `)
    .eq("id", id)
    .single<TripDetail>();

  if (error || !trip) notFound();

  // Fetch the current reconciliation if this trip has one
  const { data: rec } = await supabase
    .schema("app")
    .from("reconciliations")
    .select("status, variance_pct, gps_km")
    .eq("trip_id", id)
    .eq("is_current", true)
    .maybeSingle<{ status: ReconciliationStatus; variance_pct: number; gps_km: number }>();

  const distance =
    trip.start_odometer_km != null && trip.end_odometer_km != null
      ? trip.end_odometer_km - trip.start_odometer_km
      : null;

  const timeline = [
    { ts: trip.created_at, icon: Calendar, label: "Created", tone: "ink" as const },
    { ts: trip.started_at, icon: PlayCircle, label: "Started", tone: "sky" as const },
    { ts: trip.paused_at, icon: PauseCircle, label: "Paused", tone: "amber" as const },
    { ts: trip.ended_at, icon: StopCircle, label: "Ended", tone: "violet" as const },
    { ts: trip.completed_at, icon: CheckCircle2, label: "Completed", tone: "emerald" as const },
    { ts: trip.cancelled_at, icon: XCircle, label: "Cancelled", tone: "rose" as const },
  ].filter((e) => e.ts);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/trips"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-3">
              <TripStatusBadge status={trip.status} />
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
                {trip.purpose.replace("_", " ")}
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              {trip.route_description ||
                (trip.origin_label && trip.destination_label
                  ? `${trip.origin_label} → ${trip.destination_label}`
                  : "Trip")}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              {trip.vehicles && (
                <span className="inline-flex items-center gap-1.5">
                  <PlateBadge
                    plate={trip.vehicles.plate_number}
                    country={trip.vehicles.plate_country}
                    size="sm"
                  />
                  <span className="ml-1 text-slate-300">
                    {trip.vehicles.make} {trip.vehicles.model}
                  </span>
                </span>
              )}
              {trip.drivers?.profiles?.full_name && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {trip.drivers.profiles.full_name}
                </span>
              )}
              {trip.subsidiaries?.name && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {trip.subsidiaries.name}
                </span>
              )}
            </div>
          </div>

          {/* Live duration */}
          {(trip.status === "in_progress" || trip.status === "paused") && (
            <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 px-5 py-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] font-bold">Live</span>
              </div>
              <p className="text-lg font-bold text-white tabular mt-1">
                {duration(trip.started_at, null)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FactCard
          icon={Gauge}
          tone="sky"
          label="Start odometer"
          value={trip.start_odometer_km != null ? `${trip.start_odometer_km.toLocaleString()} km` : "—"}
          mono
        />
        <FactCard
          icon={Gauge}
          tone={trip.end_odometer_km ? "violet" : "ink"}
          label="End odometer"
          value={trip.end_odometer_km != null ? `${trip.end_odometer_km.toLocaleString()} km` : "Pending"}
          mono
        />
        <FactCard
          icon={MapPin}
          tone={distance != null ? "emerald" : "ink"}
          label="Distance"
          value={distance != null ? `${distance.toLocaleString()} km` : "—"}
          mono
        />
        <FactCard
          icon={Clock}
          tone="amber"
          label="Duration"
          value={duration(trip.started_at, trip.ended_at)}
          mono
        />
      </div>

      {/* Two-column: timeline + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline */}
          <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
            <h2 className="text-base font-bold text-ink-900 mb-5">Timeline</h2>
            <div className="space-y-4">
              {timeline.map((e, i) => {
                const tone = {
                  ink: "bg-ink-100 text-ink-600",
                  sky: "bg-sky-50 text-sky-600",
                  amber: "bg-amber-50 text-amber-600",
                  violet: "bg-violet-50 text-violet-600",
                  emerald: "bg-emerald-50 text-emerald-600",
                  rose: "bg-rose-50 text-rose-600",
                }[e.tone];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                      <e.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className="text-sm font-semibold text-ink-900">{e.label}</p>
                      <p className="text-xs text-ink-500 mt-0.5">{fmtDate(e.ts)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fuel */}
          {(trip.fuel_litres != null || trip.fuel_amount != null) && (
            <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="h-4 w-4 text-orange-600" />
                <h2 className="text-base font-bold text-ink-900">Fuel uplift</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Volume</p>
                  <p className="text-xl font-bold text-ink-900 tabular mt-1">
                    {trip.fuel_litres != null ? `${trip.fuel_litres} L` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Amount</p>
                  <p className="text-xl font-bold text-ink-900 tabular mt-1">
                    {trip.fuel_amount != null
                      ? `${trip.fuel_currency ?? "USD"} ${trip.fuel_amount}`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cancellation reason */}
          {trip.cancellation_reason && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5">
              <p className="text-[10px] uppercase tracking-wider text-rose-600 font-bold">
                Cancellation reason
              </p>
              <p className="text-sm text-rose-800 mt-1">{trip.cancellation_reason}</p>
            </div>
          )}
        </div>

        {/* Actions + Reconciliation */}
        <div className="space-y-4">
          <TripActions
            tripId={trip.id}
            status={trip.status}
            startOdometer={trip.start_odometer_km}
            isManager={profile.role === "fleet_manager" || profile.role === "admin"}
          />

          {rec && (
            <Link
              href={`/reconciliation/${trip.id}`}
              className="block rounded-2xl bg-white border border-ink-200/70 p-5 hover:border-orange-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-ink-900">Reconciliation</h3>
                <ReconciliationBadge status={rec.status} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">GPS</p>
                  <p className="text-lg font-bold text-ink-900 font-plate mt-0.5">
                    {Number(rec.gps_km).toLocaleString()} km
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Variance</p>
                  <p className="text-lg font-bold text-ink-900 font-plate mt-0.5">
                    {(Number(rec.variance_pct) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="text-xs text-orange-600 hover:underline mt-3 font-semibold">
                View details →
              </p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function FactCard({
  icon: Icon,
  tone,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "amber" | "emerald" | "violet" | "ink";
  label: string;
  value: string;
  mono?: boolean;
}) {
  const toneMap = {
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    ink: "bg-ink-100 text-ink-600 ring-ink-200",
  };
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center mb-3 ${toneMap[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className={`mt-1 text-lg font-bold text-ink-900 ${mono ? "font-plate" : ""}`}>{value}</p>
    </div>
  );
}
