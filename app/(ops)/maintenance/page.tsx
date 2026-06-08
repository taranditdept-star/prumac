import Link from "next/link";
import { Plus, Wrench, ArrowUpRight, Calendar, Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { MaintenanceFilters } from "@/components/ops/MaintenanceFilters";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 300;

interface ServiceRow {
  id: string;
  performed_at: string;
  odometer_km: number | null;
  is_routine_service: boolean;
  workshop: string | null;
  total_amount: number;
  currency: string;
  summary: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  subsidiaries: { name: string } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function money(n: number, c = "USD"): string {
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; vehicle?: string; type?: string }>;
}) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const supabase = await createClient();

  const period = sp.period ?? "all";
  const vehicleId = sp.vehicle && sp.vehicle !== "all" ? sp.vehicle : null;
  const typeFilter = sp.type && sp.type !== "all" ? sp.type : null;
  const range = rangeFor(period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (qb: any) => {
    if (range) qb = qb.gte("performed_at", range.start).lt("performed_at", range.end);
    if (vehicleId) qb = qb.eq("vehicle_id", vehicleId);
    if (typeFilter) qb = qb.eq("is_routine_service", typeFilter === "routine");
    return qb;
  };

  // Filter options + lightweight stats over the whole filtered set
  const [{ data: vehiclesOpt }, { data: minRow }, { data: maxRow }, { data: statRows }] = await Promise.all([
    supabase.schema("app").from("vehicles").select("id, plate_number, make, model").order("plate_number"),
    supabase.schema("app").from("service_records").select("performed_at").order("performed_at", { ascending: true }).limit(1).maybeSingle<{ performed_at: string }>(),
    supabase.schema("app").from("service_records").select("performed_at").order("performed_at", { ascending: false }).limit(1).maybeSingle<{ performed_at: string }>(),
    applyFilters(supabase.schema("app").from("service_records").select("total_amount, is_routine_service")).limit(10000),
  ]);
  const months = monthsBetween(minRow?.performed_at ?? null, maxRow?.performed_at ?? null);

  const allStats = (statRows ?? []) as { total_amount: number; is_routine_service: boolean }[];
  const stats = {
    total: allStats.length,
    spend: allStats.reduce((s, r) => s + Number(r.total_amount), 0),
    routine: allStats.filter((r) => r.is_routine_service).length,
    repairs: allStats.filter((r) => !r.is_routine_service).length,
  };

  const { data: rows } = await applyFilters(
    supabase.schema("app").from("service_records").select(`
      id, performed_at, odometer_km, is_routine_service, workshop, total_amount, currency, summary,
      vehicles(plate_number, plate_country, make, model),
      subsidiaries:reimburse_from_subsidiary_id(name)
    `),
  ).order("performed_at", { ascending: false }).limit(LIST_LIMIT);

  const list = (rows ?? []) as ServiceRow[];
  const spendLabel = range || vehicleId || typeFilter ? "Filtered spend" : "Total spend";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Maintenance</h1>
          <p className="text-sm text-ink-500 mt-1">Service records and repair history</p>
        </div>
        <Link
          href="/maintenance/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Log service
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Wrench} tone="brand" label="Total records" value={stats.total.toLocaleString()} />
        <Tile icon={Calendar} tone="emerald" label="Routine services" value={stats.routine.toLocaleString()} />
        <Tile icon={Gauge} tone="amber" label="Repairs" value={stats.repairs.toLocaleString()} />
        <Tile icon={Wrench} tone="violet" label={spendLabel} value={money(stats.spend)} />
      </div>

      <MaintenanceFilters
        vehicles={(vehiclesOpt ?? []) as { id: string; plate_number: string; make: string; model: string }[]}
        months={months}
      />

      <p className="text-xs text-ink-500">
        Showing <span className="font-bold text-ink-700">{list.length.toLocaleString()}</span>
        {stats.total > list.length && <> of <span className="font-bold text-ink-700">{stats.total.toLocaleString()}</span></>} records
      </p>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Wrench className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No service records yet</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">
            Log a service to start tracking maintenance and reimbursements.
          </p>
          <Link
            href="/maintenance/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Log service
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Performed</th>
                <th className="px-6 py-3 text-left">Workshop</th>
                <th className="px-6 py-3 text-left">Reimburse from</th>
                <th className="px-6 py-3 text-right">Odometer</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${
                        r.is_routine_service
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${r.is_routine_service ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {r.is_routine_service ? "Service" : "Repair"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {r.vehicles && (
                      <Link href={`/vehicles`} className="block">
                        <PlateBadge plate={r.vehicles.plate_number} country={r.vehicles.plate_country} size="sm" />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {r.vehicles.make} {r.vehicles.model}
                        </p>
                      </Link>
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink-700">{fmtDate(r.performed_at)}</td>
                  <td className="px-6 py-4 text-ink-600 truncate max-w-[160px]">
                    {r.workshop ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-ink-600 truncate max-w-[140px]">
                    {r.subsidiaries?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700 font-semibold">
                    {r.odometer_km != null ? `${r.odometer_km.toLocaleString()} km` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs font-bold text-ink-900">
                    {money(r.total_amount, r.currency)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ArrowUpRight className="h-4 w-4 text-ink-300 group-hover:text-orange-600 transition-colors mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "emerald" | "amber" | "violet";
  label: string;
  value: string;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-600" },
  }[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
      <div className={`absolute top-0 right-0 h-20 w-20 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${t.text} tabular mt-2 font-plate`}>{value}</p>
    </div>
  );
}
