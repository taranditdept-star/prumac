import Link from "next/link";
import { Map, Plus, ArrowUpRight, Activity, CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import { TripsFilters } from "@/components/ops/TripsFilters";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

interface TripListRow {
  id: string;
  status: TripStatus;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { id: string; profiles: { full_name: string | null } | null } | null;
  subsidiaries: { name: string } | null;
}

function fmtStarted(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff >= 0 && diff < 86400) {
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function rangeFor(period: string): { start: string; end: string } | null {
  if (/^\d{4}$/.test(period)) return { start: `${period}-01-01`, end: `${Number(period) + 1}-01-01` };
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { start: `${period}-01`, end };
  }
  return null;
}

function monthsBetween(min: string | null, max: string | null): string[] {
  if (!min || !max) return [];
  const a = new Date(min), b = new Date(max);
  const out: string[] = [];
  let y = a.getFullYear(), m = a.getMonth();
  while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    if (++m > 11) { m = 0; y++; }
  }
  return out;
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; vehicle?: string; status?: string; q?: string }>;
}) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const supabase = await createClient();

  const period = sp.period ?? "all";
  const vehicleId = sp.vehicle && sp.vehicle !== "all" ? sp.vehicle : null;
  const statusFilter = sp.status && sp.status !== "all" ? sp.status : null;
  const qText = (sp.q ?? "").trim();
  const range = rangeFor(period);

  // Apply the shared (non-status) filters to any query builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (qb: any) => {
    if (range) qb = qb.gte("started_at", range.start).lt("started_at", range.end);
    if (vehicleId) qb = qb.eq("vehicle_id", vehicleId);
    if (qText) qb = qb.ilike("route_description", `%${qText}%`);
    return qb;
  };

  // Build the (filtered, status-included) list query. No count:exact — the
  // total is derived from the lightweight status fetch below (avoids a full
  // COUNT on every load).
  let listQ = applyFilters(
    supabase.schema("app").from("trips").select(`
      id, status, route_description, origin_label, destination_label,
      start_odometer_km, end_odometer_km, started_at,
      vehicles(plate_number, plate_country, make, model),
      drivers(id, profiles(full_name)),
      subsidiaries(name)
    `),
  );
  if (statusFilter) listQ = listQ.eq("status", statusFilter);
  listQ = listQ
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  // Everything in ONE parallel wave: filter options, status breakdown, list.
  const [{ data: vehiclesOpt }, { data: minRow }, { data: maxRow }, { data: statusRows }, listRes] =
    await Promise.all([
      supabase.schema("app").from("vehicles").select("id, plate_number, make, model").order("plate_number"),
      supabase.schema("app").from("trips").select("started_at").not("started_at", "is", null).order("started_at", { ascending: true }).limit(1).maybeSingle<{ started_at: string }>(),
      supabase.schema("app").from("trips").select("started_at").not("started_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle<{ started_at: string }>(),
      applyFilters(supabase.schema("app").from("trips").select("status")).limit(20000),
      listQ,
    ]);

  const months = monthsBetween(minRow?.started_at ?? null, maxRow?.started_at ?? null);
  const statuses = (statusRows ?? []) as { status: string }[];
  const active = statuses.filter((s) => s.status === "in_progress" || s.status === "paused").length;
  const awaiting = statuses.filter((s) => s.status === "ended").length;
  const completed = statuses.filter((s) => s.status === "completed").length;
  const cancelled = statuses.filter((s) => s.status === "cancelled").length;

  const { data: trips, error } = listRes as { data: TripListRow[] | null; error: { message: string } | null };
  // Total matching the current filters (incl. status) — from the status fetch.
  const total = statusFilter ? statuses.filter((s) => s.status === statusFilter).length : statuses.length;

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load trips: {error.message}
        </div>
      </div>
    );
  }

  const list = (trips ?? []) as TripListRow[];
  const totalCount = total;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Trips</h1>
          <p className="text-sm text-ink-500 mt-1">All vehicle trips, live and historic</p>
        </div>
        <Link
          href="/trips/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" /> New trip
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Activity} tone="sky" label="In progress" value={active} />
        <StatTile icon={Clock} tone="violet" label="Awaiting completion" value={awaiting} />
        <StatTile icon={CheckCircle2} tone="emerald" label="Completed" value={completed} />
        <StatTile icon={XCircle} tone="rose" label="Cancelled" value={cancelled} />
      </div>

      <TripsFilters
        vehicles={(vehiclesOpt ?? []) as { id: string; plate_number: string; make: string; model: string }[]}
        months={months}
      />

      <p className="text-xs text-ink-500">
        Showing <span className="font-bold text-ink-700">{list.length.toLocaleString()}</span>
        {totalCount > list.length && <> of <span className="font-bold text-ink-700">{totalCount.toLocaleString()}</span></>} trips
        {totalCount > LIST_LIMIT && <span className="text-ink-400"> · narrow with a filter to see the rest</span>}
      </p>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Map className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No trips match these filters</p>
          <p className="text-xs text-ink-500 mt-1">Try a different period or vehicle.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Driver</th>
                <th className="px-6 py-3 text-left">Route</th>
                <th className="px-6 py-3 text-right">Distance</th>
                <th className="px-6 py-3 text-left">Started</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((t) => {
                const distance =
                  t.start_odometer_km != null && t.end_odometer_km != null
                    ? t.end_odometer_km - t.start_odometer_km
                    : null;
                return (
                  <tr key={t.id} className="hover:bg-ink-50/40 transition-colors group">
                    <td className="px-6 py-4"><TripStatusBadge status={t.status} /></td>
                    <td className="px-6 py-4">
                      <Link href={`/trips/${t.id}`} className="block">
                        {t.vehicles && (
                          <PlateBadge plate={t.vehicles.plate_number} country={t.vehicles.plate_country} size="sm" />
                        )}
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[180px]">
                          {t.vehicles?.make} {t.vehicles?.model}
                        </p>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink-900 truncate max-w-[160px]">
                        {t.drivers?.profiles?.full_name ?? "Unknown"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink-700 truncate max-w-[280px]">
                        {t.route_description ||
                          (t.origin_label && t.destination_label ? `${t.origin_label} → ${t.destination_label}` : "—")}
                      </p>
                      {t.subsidiaries?.name && (
                        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold mt-1">{t.subsidiaries.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-plate text-xs font-semibold text-ink-700">
                        {distance != null ? `${distance.toLocaleString()} km` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4"><span className="text-xs text-ink-500">{fmtStarted(t.started_at)}</span></td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/trips/${t.id}`}
                        className="inline-flex h-8 w-8 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "violet" | "emerald" | "rose";
  label: string;
  value: number;
}) {
  const t = {
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
  }[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
      <div className={`absolute top-0 right-0 h-20 w-20 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${t.text} tabular mt-2`}>{value.toLocaleString()}</p>
    </div>
  );
}
