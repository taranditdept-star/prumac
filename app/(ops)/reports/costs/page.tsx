import Link from "next/link";
import { ArrowLeft, Download, Coins, Gauge, Fuel, Wrench, TrendingDown, Info } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MaintenanceTrendChart } from "@/components/ops/ReportsCharts";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface CostSummary {
  total_km: number;
  fuel_spend: number;
  fuel_litres: number;
  maintenance_spend: number;
  maintenance_routine: number;
  maintenance_repair: number;
  operating_cost: number;
  cost_per_km: number | null;
  avg_l_100km: number | null;
}
interface VehicleCost {
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  km: number;
  fuel_spend: number;
  maintenance_spend: number;
  operating_cost: number;
  cost_per_km: number | null;
  l_100km: number | null;
}
interface MaintTrend {
  month_label: string;
  routine: number;
  repair: number;
  total: number;
}

function money(n: number): string {
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function moneyCompact(n: number): string {
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export default async function CostReportsPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const [sumRes, vehRes, trendRes] = await Promise.all([
    supabase.schema("app").rpc("fn_fleet_cost_summary", { p_start: periodStart, p_end: periodEnd }),
    supabase.schema("app").rpc("fn_vehicle_cost_breakdown", { p_start: periodStart, p_end: periodEnd }),
    supabase.schema("app").rpc("fn_maintenance_spend_trend", { p_months: 12 }),
  ]);

  const s: CostSummary =
    Array.isArray(sumRes.data) && sumRes.data.length > 0
      ? (sumRes.data[0] as CostSummary)
      : {
          total_km: 0, fuel_spend: 0, fuel_litres: 0, maintenance_spend: 0,
          maintenance_routine: 0, maintenance_repair: 0, operating_cost: 0,
          cost_per_km: null, avg_l_100km: null,
        };
  const vehicles: VehicleCost[] = Array.isArray(vehRes.data) ? (vehRes.data as VehicleCost[]) : [];
  const trend: MaintTrend[] = Array.isArray(trendRes.data) ? (trendRes.data as MaintTrend[]) : [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <section className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-8 py-7 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div>
            <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors mb-3">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to reports
            </Link>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Operating costs</h1>
            <p className="mt-2 text-sm text-slate-300 max-w-xl">
              Fuel, maintenance and cost-per-km across the fleet · last 12 months
            </p>
          </div>
          <a
            href="/reports/export/vehicle-costs.csv"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all"
          >
            <Download className="h-4 w-4" /> Export costs
          </a>
        </div>
      </section>

      {/* KPI row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Coins} tone="brand" label="Operating cost" value={moneyCompact(s.operating_cost)} hint="fuel + maintenance" />
        <Kpi icon={Gauge} tone="violet" label="Cost per km" value={s.cost_per_km != null ? `$${Number(s.cost_per_km).toFixed(2)}` : "—"} hint={`${Number(s.total_km).toLocaleString()} km`} />
        <Kpi icon={Fuel} tone="sky" label="Fuel spend" value={moneyCompact(s.fuel_spend)} hint={`${Number(s.fuel_litres).toLocaleString()} L logged`} />
        <Kpi icon={Wrench} tone="amber" label="Maintenance" value={moneyCompact(s.maintenance_spend)} hint={`${moneyCompact(s.maintenance_repair)} repairs`} />
      </section>

      {/* Maintenance trend + cost split */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-ink-900">Maintenance spend trend</h2>
            <p className="text-xs text-ink-500 mt-0.5">Routine service vs repairs, last 12 months</p>
          </div>
          <MaintenanceTrendChart data={trend} />
        </div>

        <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
          <h2 className="text-base font-bold text-ink-900 mb-4">Cost split</h2>
          <CostSplit label="Fuel (logged)" value={s.fuel_spend} total={s.operating_cost} color="bg-sky-500" />
          <CostSplit label="Routine service" value={s.maintenance_routine} total={s.operating_cost} color="bg-emerald-500" />
          <CostSplit label="Repairs" value={s.maintenance_repair} total={s.operating_cost} color="bg-amber-500" />
          <div className="mt-4 pt-4 border-t border-ink-100 flex items-baseline justify-between">
            <span className="text-xs text-ink-500">Total operating cost</span>
            <span className="text-lg font-bold text-ink-900 font-plate tabular">{money(s.operating_cost)}</span>
          </div>
        </div>
      </section>

      {/* Per-vehicle table */}
      <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-ink-900">Cost by vehicle</h2>
            <p className="text-xs text-ink-500 mt-0.5">Highest operating cost first · last 12 months</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 rounded-lg px-2 py-1">
            <TrendingDown className="h-3 w-3" /> Watch high cost/km
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-5 py-3 text-left">Vehicle</th>
                <th className="px-5 py-3 text-right">Distance</th>
                <th className="px-5 py-3 text-right">Fuel</th>
                <th className="px-5 py-3 text-right">Maintenance</th>
                <th className="px-5 py-3 text-right">Operating cost</th>
                <th className="px-5 py-3 text-right">Cost / km</th>
                <th className="px-5 py-3 text-right">L / 100km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {vehicles.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500 italic">No cost activity in this window.</td></tr>
              ) : (
                vehicles.map((v) => {
                  const cpk = v.cost_per_km != null ? Number(v.cost_per_km) : null;
                  const high = cpk != null && cpk > 1;
                  return (
                    <tr key={v.vehicle_id} className="hover:bg-ink-50/40 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/vehicles/${v.vehicle_id}`} className="inline-flex items-center gap-2 group">
                          <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />
                          <span className="text-ink-700 group-hover:text-orange-600 transition-colors">{v.make} {v.model}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right font-plate text-xs text-ink-700">{Number(v.km).toLocaleString()} km</td>
                      <td className="px-5 py-3 text-right font-plate text-xs text-ink-700">{money(v.fuel_spend)}</td>
                      <td className="px-5 py-3 text-right font-plate text-xs text-ink-700">{money(v.maintenance_spend)}</td>
                      <td className="px-5 py-3 text-right font-plate text-xs font-bold text-ink-900">{money(v.operating_cost)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-plate text-xs font-bold ${high ? "text-rose-700" : "text-ink-700"}`}>
                          {cpk != null ? `$${cpk.toFixed(2)}` : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-plate text-xs text-ink-500">
                        {v.l_100km != null ? Number(v.l_100km).toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-2 text-xs text-ink-500 px-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-ink-400" />
        Fuel figures reflect logged fuel-card fills (Fuel section) — they grow as drivers log fills, and are the reliable
        source for cost-per-km. Maintenance and distance are complete from service records and completed trips.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon, tone, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "sky" | "violet" | "amber";
  label: string;
  value: string;
  hint: string;
}) {
  const t = {
    brand: "bg-orange-50 text-orange-600 ring-orange-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center mb-3 ${t}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-2xl font-bold text-ink-900 tabular font-plate mt-1">{value}</p>
      <p className="text-[11px] text-ink-500 mt-1">{hint}</p>
    </div>
  );
}

function CostSplit({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((Number(value) / Number(total)) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-ink-600">{label}</span>
        <span className="font-plate text-xs font-bold text-ink-900">${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
