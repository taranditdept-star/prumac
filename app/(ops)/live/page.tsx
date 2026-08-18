import Link from "next/link";
import type { ReactNode } from "react";
import {
  Truck,
  Users,
  AlertTriangle,
  Activity,
  TrendingUp,
  MapPin,
  ArrowUpRight,
  Sparkles,
  Gauge,
  ShieldCheck,
  Wrench,
  ClipboardList,
  CarFront,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ops/StatCard";
import { AlertsStatus } from "@/components/ops/AlertsStatus";
import { AttendanceBanner } from "@/components/attendance/AttendanceBanner";
import { StatusDonut } from "@/components/ops/StatusDonut";
import { FleetActivityChart } from "@/components/ops/FleetActivityChart";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { VehicleStatusBadge } from "@/components/primitives/VehicleStatusBadge";
import { ExpiryBadge } from "@/components/primitives/ExpiryBadge";
import { getExpiryUrgency } from "@/lib/utils/expiry";
import type { VehicleRow, DocumentRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function greetingFor(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const ACTIVITY_WEEKS = 8;

interface TripActivityRow {
  started_at: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
}

interface OpenFaultRow {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  category: string;
  reported_at: string;
  source: string;
  vehicles: { plate_number: string; plate_country: string } | null;
}

function faultAgo(iso: string): string {
  const hrs = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700",
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-ink-100 text-ink-600",
};

/** Monday 00:00 (server-local) of the week containing `d`, matching Postgres date_trunc('week'). */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Bucket trips into the last ACTIVITY_WEEKS weekly buckets: count + summed odometer km. */
function weeklyActivity(rows: TripActivityRow[]): { day: string; trips: number; km: number }[] {
  const thisMonday = startOfWeek(new Date());
  const buckets = Array.from({ length: ACTIVITY_WEEKS }, (_, i) => {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - (ACTIVITY_WEEKS - 1 - i) * 7);
    return {
      startMs: start.getTime(),
      endMs: start.getTime() + 7 * 86_400_000,
      day: start.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      trips: 0,
      km: 0,
    };
  });
  for (const r of rows) {
    if (!r.started_at) continue;
    const t = new Date(r.started_at).getTime();
    const b = buckets.find((x) => t >= x.startMs && t < x.endMs);
    if (!b) continue;
    b.trips += 1;
    if (r.end_odometer_km != null && r.start_odometer_km != null) {
      b.km += Math.max(r.end_odometer_km - r.start_odometer_km, 0);
    }
  }
  return buckets.map(({ day, trips, km }) => ({ day, trips, km }));
}

export default async function LiveOpsPage() {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const activityCutoff = new Date(startOfWeek(new Date()));
  activityCutoff.setDate(activityCutoff.getDate() - (ACTIVITY_WEEKS - 1) * 7);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: vehicles },
    { data: docs },
    { data: subsidiaries },
    { data: drivers },
    { data: activityRows },
    { data: openFaults, count: openFaultsCount },
    { count: openAccidentsCount },
    { count: failedChecksCount },
    { data: locationOffDrivers },
  ] = await Promise.all([
    supabase.schema("app").from("vehicles").select("*").returns<VehicleRow[]>(),
    supabase
      .schema("app")
      .from("vehicle_documents")
      .select("vehicle_id, document_type, expires_at")
      .eq("is_active", true)
      .returns<Pick<DocumentRow, "vehicle_id" | "document_type" | "expires_at">[]>(),
    supabase.schema("app").from("subsidiaries").select("id"),
    supabase.schema("app").from("drivers").select("id, is_active"),
    supabase
      .schema("app")
      .from("trips")
      .select("started_at, start_odometer_km, end_odometer_km")
      .gte("started_at", activityCutoff.toISOString())
      .not("status", "in", "(planned,cancelled)")
      .returns<TripActivityRow[]>(),
    // Reported issues surfacing — open faults (with a preview list), open
    // accidents, and failed/attention checks in the last 7 days.
    supabase
      .schema("app")
      .from("faults")
      .select("id, severity, title, category, reported_at, source, vehicles(plate_number, plate_country)", {
        count: "exact",
      })
      .in("status", ["reported", "acknowledged", "in_repair"])
      .order("reported_at", { ascending: false })
      .limit(6)
      .returns<OpenFaultRow[]>(),
    supabase
      .schema("app")
      .from("accidents")
      .select("id", { count: "exact", head: true })
      .neq("status", "closed"),
    supabase
      .schema("app")
      .from("inspections")
      .select("id", { count: "exact", head: true })
      .in("overall_result", ["fail", "attention"])
      .gte("completed_at", sevenDaysAgo),
    // Drivers who have location sharing turned OFF (refused permission).
    supabase
      .schema("app")
      .from("profiles")
      .select("full_name")
      .eq("role", "driver")
      .eq("location_status", "denied")
      .returns<{ full_name: string | null }[]>(),
  ]);

  const activityData = weeklyActivity(activityRows ?? []);

  const allVehicles = vehicles ?? [];
  const active = allVehicles.filter((v) => v.status !== "decommissioned");
  const available = active.filter((v) => v.status === "available").length;
  const onTrip = active.filter((v) => v.status === "on_trip").length;
  const maintenance = active.filter((v) => v.status === "maintenance").length;
  const workshop = active.filter((v) => v.status === "workshop").length;

  const expiredDocs = (docs ?? []).filter(
    (d) => getExpiryUrgency(d.expires_at) === "expired",
  ).length;
  const expiringSoonDocs = (docs ?? []).filter((d) => {
    const u = getExpiryUrgency(d.expires_at);
    return u === "critical" || u === "warning";
  }).length;

  const totalOdoKm = active.reduce((s, v) => s + v.current_odometer_km, 0);
  const avgOdoKm = active.length ? Math.round(totalOdoKm / active.length) : 0;
  const complianceRate = docs?.length
    ? Math.round(((docs.length - expiredDocs - expiringSoonDocs) / docs.length) * 100)
    : 100;

  const urgencyRank = { expired: 0, critical: 1, warning: 2, ok: 3 } as const;
  const docsByVehicle = new Map<string, typeof docs>();
  for (const d of docs ?? []) {
    if (!docsByVehicle.has(d.vehicle_id)) docsByVehicle.set(d.vehicle_id, []);
    docsByVehicle.get(d.vehicle_id)!.push(d);
  }
  const attentionVehicles = [...active]
    .map((v) => {
      const vDocs = docsByVehicle.get(v.id) ?? [];
      const worst = vDocs.reduce(
        (acc, d) => Math.min(acc, urgencyRank[getExpiryUrgency(d.expires_at)]),
        3,
      );
      const earliest = vDocs.map((d) => d.expires_at).sort()[0];
      return { v, worst, earliest };
    })
    .filter((x) => x.worst <= 2)
    .sort((a, b) => a.worst - b.worst)
    .slice(0, 5);

  const firstName = profile.full_name?.split(" ")[0] ?? "Admin";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Daily attendance check-in */}
      <AttendanceBanner />

      {/* Emergency-alert enablement / test / status */}
      <AlertsStatus />

      {/* Hero header */}
      <section className="relative rounded-3xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-8 py-8 lg:px-10 lg:py-10">
          {/* Decorative glow */}
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 left-32 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
          <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

          <div className="relative flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-4 border border-white/10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-white">Live</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
                {greetingFor()}, {firstName}
              </h1>
              <p className="mt-2 text-sm text-slate-300 max-w-lg">
                Your fleet of <span className="font-semibold text-white">{active.length} vehicles</span> is
                running across <span className="font-semibold text-white">2 countries</span> for{" "}
                <span className="font-semibold text-white">{(subsidiaries ?? []).length} subsidiaries</span>.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/live/map"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all"
                >
                  <MapPin className="h-4 w-4" />
                  Open Live Map
                </Link>
                <Link
                  href="/vehicles"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 backdrop-blur text-white text-sm font-semibold hover:bg-white/15 border border-white/10 transition-colors"
                >
                  View fleet
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Hero KPI block */}
            <div className="grid grid-cols-3 gap-3 lg:gap-6">
              <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4 lg:p-5 min-w-32">
                <Gauge className="h-5 w-5 text-orange-400 mb-3" />
                <p className="text-2xl lg:text-3xl font-bold text-white tabular">
                  {(totalOdoKm / 1_000_000).toFixed(1)}M
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mt-1.5 font-semibold">
                  Fleet km
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4 lg:p-5 min-w-32">
                <ShieldCheck className="h-5 w-5 text-emerald-400 mb-3" />
                <p className="text-2xl lg:text-3xl font-bold text-white tabular">
                  {complianceRate}%
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mt-1.5 font-semibold">
                  Compliant
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-4 lg:p-5 min-w-32">
                <Activity className="h-5 w-5 text-sky-400 mb-3" />
                <p className="text-2xl lg:text-3xl font-bold text-white tabular">
                  {available}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 mt-1.5 font-semibold">
                  Ready
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          index={0}
          label="Active fleet"
          value={active.length}
          iconName="truck"
          tone="brand"
          hint={`${allVehicles.length - active.length} decommissioned`}
        />
        <StatCard
          index={1}
          label="On trip"
          value={onTrip}
          iconName="activity"
          tone="sky"
          hint={`${available} ready to dispatch`}
        />
        <StatCard
          index={2}
          label="Active drivers"
          value={(drivers ?? []).filter((d) => d.is_active).length}
          iconName="users"
          tone="violet"
          hint={`${(subsidiaries ?? []).length} subsidiaries`}
        />
        <StatCard
          index={3}
          label="Documents expired"
          value={expiredDocs}
          iconName="alert"
          tone={expiredDocs > 0 ? "rose" : "emerald"}
          hint={`${expiringSoonDocs} expiring soon`}
        />
      </section>

      {/* Reported issues — faults, accidents, failed checks */}
      <section className="rounded-2xl bg-white border border-ink-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <div className="inline-flex items-center gap-2 mb-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  (openFaultsCount ?? 0) + (openAccidentsCount ?? 0) > 0 ? "bg-rose-500 animate-pulse" : "bg-emerald-500"
                }`}
              />
              <h2 className="text-base font-semibold text-ink-900">Reported Issues</h2>
            </div>
            <p className="text-xs text-ink-500">Faults, accidents and failed checks that need action</p>
          </div>
          <Link
            href="/faults"
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
          >
            All faults
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Location-off drivers — can't be tracked */}
        {(locationOffDrivers ?? []).length > 0 && (
          <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0">
              {/* One template string: as separate JSX children the space before
                  "location" was being trimmed, rendering "drivers havelocation". */}
              <p className="text-sm font-bold text-rose-800">
                {`${(locationOffDrivers ?? []).length} ${
                  (locationOffDrivers ?? []).length === 1 ? "driver has" : "drivers have"
                } location OFF — can’t be tracked`}
              </p>
              <p className="mt-0.5 text-xs text-rose-700 break-words">
                {(locationOffDrivers ?? []).map((d) => d.full_name ?? "Unknown").join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Issue KPI tiles */}
        <div className="grid grid-cols-3 gap-3 px-6 pb-4">
          <IssueTile href="/faults" icon={<Wrench className="h-4 w-4" />} label="Open faults" value={openFaultsCount ?? 0} />
          <IssueTile href="/accidents" icon={<CarFront className="h-4 w-4" />} label="Open accidents" value={openAccidentsCount ?? 0} />
          <IssueTile href="/inspections" icon={<ClipboardList className="h-4 w-4" />} label="Failed checks · 7d" value={failedChecksCount ?? 0} tone="amber" />
        </div>

        {/* Recent open faults */}
        {(openFaults ?? []).length === 0 ? (
          <div className="py-8 text-center px-6 border-t border-ink-100">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-emerald-50 ring-4 ring-emerald-50/50 items-center justify-center mb-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-ink-900">No open faults</p>
            <p className="text-xs text-ink-500 mt-1">Every reported fault has been resolved.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100 border-t border-ink-100">
            {(openFaults ?? []).map((f) => (
              <Link
                key={f.id}
                href={`/faults/${f.id}`}
                className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-6 hover:bg-ink-50/50 transition-colors group"
              >
                {f.vehicles ? (
                  <PlateBadge plate={f.vehicles.plate_number} country={f.vehicles.plate_country as VehicleRow["plate_country"]} size="sm" />
                ) : (
                  <span className="text-xs text-ink-400">—</span>
                )}
                <div className="flex-1 min-w-0">
                  {/* Wraps on phones, truncates once there is a column to spare —
                      "Reflective v…" tells a manager nothing. */}
                  <p className="text-sm font-semibold text-ink-900 leading-snug sm:truncate">{f.title}</p>
                  <p className="text-xs text-ink-500 mt-0.5 capitalize">
                    {f.category}
                    {f.source === "checklist" && <span className="ml-1.5 text-amber-600">· from checklist</span>}
                    {" · "}
                    {faultAgo(f.reported_at)}
                  </p>
                </div>
                <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold capitalize ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.low}`}>
                  {f.severity}
                </span>
                <ArrowUpRight className="h-4 w-4 text-ink-300 group-hover:text-orange-500 transition-all" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Activity chart + Status donut */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Fleet Activity</h2>
              <p className="text-xs text-ink-500 mt-0.5">Trips and kilometres over the last 8 weeks</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                <span className="text-ink-600 font-medium">Trips</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                <span className="text-ink-600 font-medium">Kilometres</span>
              </span>
            </div>
          </div>
          <FleetActivityChart data={activityData} />
        </div>

        <div className="rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Fleet Status</h2>
              <p className="text-xs text-ink-500 mt-0.5">Operational breakdown</p>
            </div>
          </div>
          <StatusDonut
            centerValue={active.length}
            centerLabel="Vehicles"
            segments={[
              { label: "Available", value: available, color: "#10b981" },
              { label: "On trip", value: onTrip, color: "#0ea5e9" },
              { label: "Maintenance", value: maintenance, color: "#f59e0b" },
              { label: "Workshop", value: workshop, color: "#ef4444" },
            ]}
          />
        </div>
      </section>

      {/* Attention list + Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="flex items-start justify-between p-6 pb-3">
            <div>
              <div className="inline-flex items-center gap-2 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                <h2 className="text-base font-semibold text-ink-900">Attention Required</h2>
              </div>
              <p className="text-xs text-ink-500">
                Vehicles with expired or expiring documents
              </p>
            </div>
            <Link
              href="/vehicles"
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
            >
              View all
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {attentionVehicles.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="inline-flex h-14 w-14 rounded-2xl bg-emerald-50 ring-4 ring-emerald-50/50 items-center justify-center mb-3">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-ink-900">All vehicles compliant</p>
              <p className="text-xs text-ink-500 mt-1">No documents need attention right now.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {attentionVehicles.map(({ v, earliest }) => (
                <Link
                  key={v.id}
                  href={`/vehicles/${v.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6 sm:flex-nowrap hover:bg-ink-50/50 transition-colors group"
                >
                  <PlateBadge plate={v.plate_number} country={v.plate_country} />
                  {/* basis-full below sm: the badges drop to their own line
                      instead of colliding with the branch/odometer text. */}
                  <div className="min-w-0 flex-1 basis-[45%] sm:basis-auto">
                    <p className="text-sm font-semibold text-ink-900 truncate">
                      {v.make} {v.model}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {v.home_branch ?? "—"} · {v.current_odometer_km.toLocaleString()} km
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <VehicleStatusBadge status={v.status} />
                    {earliest && <ExpiryBadge expiresAt={earliest} />}
                  </div>
                  <ArrowUpRight className="hidden sm:block h-4 w-4 text-ink-300 group-hover:text-orange-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Coverage + Insights */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white p-6 shadow-lg shadow-violet-500/20 overflow-hidden relative">
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <Sparkles className="h-6 w-6 text-violet-200 mb-4" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200 font-semibold">
              Insight
            </p>
            <p className="text-base font-semibold mt-1 leading-snug">
              {expiredDocs > 0
                ? `${expiredDocs} vehicles need urgent document renewal.`
                : "Your fleet documentation is up to date."}
            </p>
            <p className="text-xs text-violet-200 mt-3">
              {expiredDocs > 0
                ? "Renewing now prevents service disruption and reconciliation flags."
                : "Continue monitoring upcoming expiries."}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">Coverage</p>
                <p className="text-xs text-ink-500">2 countries</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-ink-600 font-medium">Zimbabwe</span>
                  <span className="font-bold text-ink-900 tabular">
                    {active.filter((v) => v.plate_country === "ZW").length}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                    style={{
                      width: `${
                        (active.filter((v) => v.plate_country === "ZW").length / (active.length || 1)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-ink-600 font-medium">South Africa</span>
                  <span className="font-bold text-ink-900 tabular">
                    {active.filter((v) => v.plate_country === "ZA").length}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                    style={{
                      width: `${
                        (active.filter((v) => v.plate_country === "ZA").length / (active.length || 1)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-ink-100 flex items-baseline justify-between">
              <span className="text-xs text-ink-500">Avg. mileage</span>
              <span className="text-base font-bold text-ink-900 tabular">
                {avgOdoKm.toLocaleString()} km
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function IssueTile({
  href,
  icon,
  label,
  value,
  tone = "rose",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "rose" | "amber";
}) {
  const active = value > 0;
  const activeCls = tone === "amber" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50";
  const iconCls = tone === "amber" ? "text-amber-600" : "text-rose-600";
  return (
    <Link
      href={href}
      className={`flex flex-col items-start gap-2 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:gap-3 ${
        active ? activeCls : "border-ink-200/70 bg-white hover:bg-ink-50/50"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white" : "bg-ink-100"} ${active ? iconCls : "text-ink-400"}`}>
        {icon}
      </span>
      <div className="min-w-0 w-full">
        <p className="text-xl font-bold text-ink-900 tabular leading-none">{value}</p>
        {/* No truncate: at three-across on a phone these read "Ope…", "Faile…". */}
        <p className="text-[11px] text-ink-500 mt-1 leading-tight">{label}</p>
      </div>
    </Link>
  );
}
