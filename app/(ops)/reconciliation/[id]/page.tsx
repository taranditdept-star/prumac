import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Gauge, Satellite, ShieldAlert, AlertCircle, MapPin, Building2,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { ReconciliationBadge } from "@/components/primitives/ReconciliationBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import { GpsTrailMap } from "@/components/ops/GpsTrailMap";
import { ReconcileButton } from "@/components/ops/ReconcileButton";
import type { CountryCode, ReconciliationStatus, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ReconciliationFull {
  id: string;
  trip_id: string;
  odometer_km: number;
  gps_km: number;
  difference_km: number;
  variance_pct: number;
  status: ReconciliationStatus;
  reason_codes: string[];
  ping_count: number;
  avg_accuracy_m: number | null;
  computed_at: string;
}

interface TripJoin {
  id: string;
  status: TripStatus;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  ended_at: string | null;
  completed_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
  subsidiaries: { name: string } | null;
}

interface TrackPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kph: number | null;
  accuracy_m: number | null;
}

export default async function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = await params;
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: rec }, { data: trip }, { data: track }] = await Promise.all([
    supabase
      .schema("app")
      .from("reconciliations")
      .select("*")
      .eq("trip_id", tripId)
      .eq("is_current", true)
      .maybeSingle<ReconciliationFull>(),
    supabase
      .schema("app")
      .from("trips")
      .select(`
        id, status, route_description, origin_label, destination_label,
        start_odometer_km, end_odometer_km, started_at, ended_at, completed_at,
        vehicles(plate_number, plate_country, make, model),
        drivers(profiles(full_name)),
        subsidiaries(name)
      `)
      .eq("id", tripId)
      .maybeSingle<TripJoin>(),
    supabase.schema("app").rpc("fn_get_trip_track", { p_trip_id: tripId }),
  ]);

  if (!trip) notFound();

  const trackPoints: TrackPoint[] = Array.isArray(track) ? (track as TrackPoint[]) : [];
  const variancePct = rec ? (Number(rec.variance_pct) * 100).toFixed(1) : "—";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/reconciliation"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to reconciliations
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {rec && <ReconciliationBadge status={rec.status} />}
              <TripStatusBadge status={trip.status} />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              {trip.route_description ||
                (trip.origin_label && trip.destination_label
                  ? `${trip.origin_label} → ${trip.destination_label}`
                  : "Trip reconciliation")}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
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
                  <span className="text-slate-400">Driver:</span>
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

          {/* Headline variance */}
          {rec && (
            <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 px-6 py-4 text-center">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
                Variance
              </p>
              <p className="font-plate text-3xl lg:text-4xl font-bold text-white tabular mt-1">
                {variancePct}%
              </p>
              <p className="text-xs text-slate-400">
                {Number(rec.difference_km) >= 0 ? "+" : ""}
                {Number(rec.difference_km).toFixed(1)} km Δ
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reason codes alert */}
      {rec && rec.reason_codes.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Reasons</p>
            <p className="text-xs text-amber-700 mt-0.5 capitalize">
              {rec.reason_codes.join(" · ").replace(/_/g, " ")}
            </p>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-ink-500">
          Computed{" "}
          {rec
            ? new Date(rec.computed_at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </p>
        <ReconcileButton tripId={tripId} />
      </div>

      {/* Comparison cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ComparisonCard
          icon={Gauge}
          tone="sky"
          label="Odometer distance"
          value={rec ? Number(rec.odometer_km).toLocaleString() : "—"}
          unit="km"
          hint={
            trip.start_odometer_km != null && trip.end_odometer_km != null
              ? `${trip.start_odometer_km.toLocaleString()} → ${trip.end_odometer_km.toLocaleString()}`
              : "—"
          }
        />
        <ComparisonCard
          icon={Satellite}
          tone="violet"
          label="GPS distance"
          value={rec ? Number(rec.gps_km).toLocaleString() : "—"}
          unit="km"
          hint={rec ? `${rec.ping_count} pings recorded` : "—"}
        />
        <ComparisonCard
          icon={ShieldAlert}
          tone={
            !rec
              ? "ink"
              : rec.status === "accepted"
                ? "emerald"
                : rec.status === "warning"
                  ? "amber"
                  : "rose"
          }
          label="Variance"
          value={variancePct}
          unit="%"
          hint={
            rec
              ? `${Number(rec.difference_km) >= 0 ? "+" : ""}${Number(rec.difference_km).toFixed(1)} km off`
              : "—"
          }
        />
      </div>

      {/* GPS Trail map */}
      <section>
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-ink-900">GPS trail</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              {trackPoints.length > 0
                ? `${trackPoints.length} pings · ${rec?.avg_accuracy_m != null ? `avg accuracy ${Number(rec.avg_accuracy_m).toFixed(0)}m` : "accuracy n/a"}`
                : "No GPS data was recorded for this trip"}
            </p>
          </div>
          {trackPoints.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-ink-600 font-medium">Start</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                <span className="text-ink-600 font-medium">End</span>
              </span>
            </div>
          )}
        </div>
        <GpsTrailMap points={trackPoints} />
      </section>

      {/* Decision panel */}
      <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <h2 className="text-base font-bold text-ink-900 mb-2">Review decision</h2>
        <p className="text-sm text-ink-500 mb-4">
          {rec?.status === "accepted"
            ? "Variance is within the 5% threshold — billing will use the odometer reading."
            : rec?.status === "warning"
              ? "5–10% variance: billed as recorded but flagged for trend monitoring."
              : rec?.status === "flagged"
                ? "10–20% variance: included in billing with a flag. Review the GPS trail before issuing the invoice."
                : rec?.status === "critical"
                  ? "Variance exceeds 20%. Excluded from automatic billing — accept or adjust manually."
                  : "Reconciliation pending — re-run after GPS pings arrive."}
        </p>

        {(rec?.status === "flagged" || rec?.status === "critical") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors"
            >
              Accept as-is
            </button>
            <button
              type="button"
              className="h-11 rounded-xl bg-white border border-ink-200 hover:border-amber-300 hover:bg-amber-50 text-ink-900 text-sm font-semibold transition-all"
            >
              Adjust billing
            </button>
          </div>
        )}

        {(rec?.status === "flagged" || rec?.status === "critical") && (
          <p className="text-[11px] text-ink-400 mt-3">
            Decision recording connects to <span className="font-semibold">app.reconciliation_reviews</span>{" "}
            in Phase 9 (billing engine).
          </p>
        )}
      </section>
    </div>
  );
}

function ComparisonCard({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "violet" | "emerald" | "amber" | "rose" | "ink";
  label: string;
  value: string;
  unit: string;
  hint: string;
}) {
  const toneMap = {
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    ink: { bg: "bg-ink-100", text: "text-ink-600", ring: "ring-ink-200" },
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center mb-3 ${toneMap.bg} ${toneMap.text} ${toneMap.ring}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink-900 tabular font-plate">
        {value}
        <span className="text-base text-ink-400 ml-1">{unit}</span>
      </p>
      <p className="text-xs text-ink-500 mt-1.5">{hint}</p>
    </div>
  );
}
