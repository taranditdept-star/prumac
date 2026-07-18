import Link from "next/link";
import {
  BarChart3, DollarSign, Activity, Truck, Award, AlertCircle,
  TrendingUp, Wrench, Download, ArrowUpRight, Sparkles,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  RevenueTrendChart, SubsidiaryBarChart, FleetUtilisationChart,
} from "@/components/ops/ReportsCharts";
import { ReportEmailButton } from "@/components/ops/ReportEmailButton";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface MonthlyRevenue {
  month_label: string;
  month_start: string;
  revenue: number;
  trips: number;
  km: number;
  active_vehicles: number;
}

interface TopVehicle {
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  trips: number;
  km: number;
  revenue: number;
}

interface TopDriver {
  driver_id: string;
  full_name: string;
  trips: number;
  km: number;
  avg_trip_km: number;
}

interface SubsidiaryBreakdown {
  subsidiary_id: string;
  name: string;
  country: CountryCode;
  trips: number;
  km: number;
  revenue: number;
  outstanding: number;
}

interface FleetKpis {
  total_revenue: number;
  total_trips: number;
  total_km: number;
  active_vehicles: number;
  utilisation_pct: number;
  outstanding_balance: number;
  maintenance_spend: number;
  on_time_completion_pct: number;
}

function money(n: number, c = "USD"): string {
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function moneyCompact(n: number): string {
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export default async function ReportsPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const periodStart = last30.toISOString().slice(0, 10);
  const periodEnd = new Date().toISOString().slice(0, 10);

  const [revRes, kpiRes, vehRes, drvRes, subRes, fleetRes] = await Promise.all([
    supabase.schema("app").rpc("fn_monthly_revenue", { p_months: 12 }),
    supabase.schema("app").rpc("fn_fleet_kpis", { p_period_start: periodStart, p_period_end: periodEnd }),
    supabase.schema("app").rpc("fn_top_vehicles", { p_limit: 10, p_period_start: periodStart, p_period_end: periodEnd }),
    supabase.schema("app").rpc("fn_top_drivers", { p_limit: 10, p_period_start: periodStart, p_period_end: periodEnd }),
    supabase.schema("app").rpc("fn_subsidiary_breakdown", { p_period_start: periodStart, p_period_end: periodEnd }),
    supabase.schema("app").from("vehicles").select("id", { count: "exact", head: true }).neq("status", "decommissioned"),
  ]);

  const monthly: MonthlyRevenue[] = Array.isArray(revRes.data) ? (revRes.data as MonthlyRevenue[]) : [];
  const topVehicles: TopVehicle[] = Array.isArray(vehRes.data) ? (vehRes.data as TopVehicle[]) : [];
  const topDrivers: TopDriver[] = Array.isArray(drvRes.data) ? (drvRes.data as TopDriver[]) : [];
  const subsidiaries: SubsidiaryBreakdown[] = Array.isArray(subRes.data) ? (subRes.data as SubsidiaryBreakdown[]) : [];
  const kpis: FleetKpis = Array.isArray(kpiRes.data) && kpiRes.data.length > 0
    ? (kpiRes.data[0] as FleetKpis)
    : {
        total_revenue: 0, total_trips: 0, total_km: 0,
        active_vehicles: 0, utilisation_pct: 0,
        outstanding_balance: 0, maintenance_spend: 0,
        on_time_completion_pct: 100,
      };
  const totalFleet = fleetRes.count ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <section className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-8 py-7 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10">
              <BarChart3 className="h-3 w-3 text-orange-400" />
              <span className="text-[10px] uppercase tracking-[0.14em] text-white font-bold">
                Analytics
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              Fleet Reports
            </h1>
            <p className="mt-2 text-sm text-slate-300 max-w-xl">
              Last 30 days · {monthly.length} months of history loaded · {totalFleet} active vehicles
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/reports/costs"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 backdrop-blur text-white text-sm font-semibold hover:bg-white/15 border border-white/10 transition-colors"
            >
              <Wrench className="h-4 w-4" />
              Cost analytics
            </Link>
            <ReportEmailButton />
            <a
              href="/reports/export/trips.csv"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 backdrop-blur text-white text-sm font-semibold hover:bg-white/15 border border-white/10 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export trips
            </a>
            <a
              href="/reports/export/invoices.csv"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all"
            >
              <Download className="h-4 w-4" />
              Export invoices
            </a>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} tone="brand" label="30-day revenue" value={moneyCompact(kpis.total_revenue)} hint={`${kpis.total_trips} trips billed`} />
        <Kpi icon={Activity} tone="sky" label="Fleet utilisation" value={`${kpis.utilisation_pct}%`} hint={`${kpis.active_vehicles} / ${totalFleet} active`} />
        <Kpi icon={Truck} tone="violet" label="Distance covered" value={`${(Number(kpis.total_km) / 1000).toFixed(1)}k`} hint="kilometres in period" />
        <Kpi
          icon={AlertCircle}
          tone={Number(kpis.outstanding_balance) > 0 ? "rose" : "emerald"}
          label="Outstanding A/R"
          value={moneyCompact(kpis.outstanding_balance)}
          hint="across all subsidiaries"
        />
      </section>

      {/* Revenue trend + Utilisation */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-ink-900">Revenue trend</h2>
              <p className="text-xs text-ink-500 mt-0.5">Last 12 months · revenue (area) and trip count (line)</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1">
              <TrendingUp className="h-3 w-3" />
              Trend
            </span>
          </div>
          <RevenueTrendChart data={monthly} />
        </div>

        <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="mb-4">
            <h2 className="text-base font-bold text-ink-900">Fleet utilisation</h2>
            <p className="text-xs text-ink-500 mt-0.5">Active vehicles per month</p>
          </div>
          <FleetUtilisationChart data={monthly} totalFleet={totalFleet} />
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-baseline justify-between">
            <span className="text-xs text-ink-500">On-time reconciliation</span>
            <span className="text-base font-bold text-emerald-700 tabular font-plate">
              {kpis.on_time_completion_pct}%
            </span>
          </div>
        </div>
      </section>

      {/* Subsidiary breakdown */}
      <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-ink-900">Revenue by subsidiary</h2>
            <p className="text-xs text-ink-500 mt-0.5">Last 30 days</p>
          </div>
          <Link
            href="/subsidiaries"
            className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1"
          >
            All subsidiaries <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <SubsidiaryBarChart data={subsidiaries} />
      </section>

      {/* Top vehicles + drivers */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingCard
          title="Top earning vehicles"
          subtitle="Last 30 days"
          items={topVehicles.slice(0, 5).map((v) => ({
            id: v.vehicle_id,
            primary: `${v.make} ${v.model}`,
            secondary: <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />,
            metric: moneyCompact(v.revenue),
            sub: `${Number(v.km).toLocaleString()} km · ${v.trips} trips`,
          }))}
        />
        <RankingCard
          title="Top drivers by km"
          subtitle="Last 30 days"
          accent="violet"
          items={topDrivers.slice(0, 5).map((d) => ({
            id: d.driver_id,
            primary: d.full_name,
            secondary: (
              <span className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
                {d.trips} trips · avg {d.avg_trip_km} km
              </span>
            ),
            metric: `${Number(d.km).toLocaleString()} km`,
            sub: "lifetime distance",
          }))}
        />
      </section>

      {/* Subsidiary detailed table */}
      <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-100">
          <h2 className="text-base font-bold text-ink-900">All subsidiaries</h2>
          <p className="text-xs text-ink-500 mt-0.5">Revenue and outstanding per subsidiary</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
              <th className="px-6 py-3 text-left">Subsidiary</th>
              <th className="px-6 py-3 text-left">Country</th>
              <th className="px-6 py-3 text-right">Trips</th>
              <th className="px-6 py-3 text-right">Kilometres</th>
              <th className="px-6 py-3 text-right">Revenue</th>
              <th className="px-6 py-3 text-right">Outstanding</th>
              <th className="px-6 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {subsidiaries.map((s) => (
              <tr key={s.subsidiary_id} className="hover:bg-ink-50/40 transition-colors group">
                <td className="px-6 py-3.5">
                  <Link
                    href={`/subsidiaries/${s.subsidiary_id}`}
                    className="font-semibold text-ink-900 hover:text-orange-600 transition-colors"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-6 py-3.5">
                  <span className="inline-flex items-center rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-700 font-plate">
                    {s.country}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right text-ink-700 tabular">{Number(s.trips).toLocaleString()}</td>
                <td className="px-6 py-3.5 text-right font-plate text-xs text-ink-700 font-semibold">
                  {Number(s.km).toLocaleString()} km
                </td>
                <td className="px-6 py-3.5 text-right font-plate text-xs font-bold text-ink-900">
                  {money(s.revenue)}
                </td>
                <td className="px-6 py-3.5 text-right">
                  <span className={`font-plate text-xs font-bold ${Number(s.outstanding) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {money(s.outstanding)}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right">
                  <Link
                    href={`/subsidiaries/${s.subsidiary_id}`}
                    className="inline-flex h-7 w-7 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* Bottom insights */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white p-6 shadow-lg shadow-violet-500/20 overflow-hidden relative">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <Sparkles className="h-6 w-6 text-violet-200 mb-3" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200 font-bold">Auto insight</p>
          <p className="text-base font-semibold mt-1 leading-snug">
            {topVehicles[0]
              ? `${topVehicles[0].make} ${topVehicles[0].model} (${topVehicles[0].plate_number}) earned the most revenue this period (${moneyCompact(topVehicles[0].revenue)}).`
              : "No trip activity in the period yet."}
          </p>
          <p className="text-xs text-violet-200 mt-3 leading-relaxed">
            {Number(kpis.utilisation_pct) >= 80
              ? "Fleet utilisation is excellent. Consider expanding capacity to meet sustained demand."
              : Number(kpis.utilisation_pct) >= 50
                ? "Healthy utilisation. Look at the bottom-quartile vehicles to find idle capacity."
                : "Utilisation is low — over half the fleet is idle. Re-balance assignments or review demand."}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Maintenance</p>
              <p className="text-sm font-bold text-ink-900">30-day spend</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-ink-900 font-plate tabular">
            {moneyCompact(kpis.maintenance_spend)}
          </p>
          <Link
            href="/maintenance"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline"
          >
            View records <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon, tone, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "sky" | "violet" | "rose" | "emerald";
  label: string;
  value: string;
  hint: string;
}) {
  const t = {
    brand: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring} flex items-center justify-center mb-3`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-2xl font-bold text-ink-900 tabular font-plate mt-1">{value}</p>
      <p className="text-[11px] text-ink-500 mt-1">{hint}</p>
    </div>
  );
}

function RankingCard({
  title, subtitle, accent = "brand", items,
}: {
  title: string;
  subtitle: string;
  accent?: "brand" | "violet";
  items: { id: string; primary: string; secondary: React.ReactNode; metric: string; sub: string }[];
}) {
  const ringColor = accent === "violet" ? "ring-violet-100" : "ring-orange-100";
  const numberColor = accent === "violet" ? "text-violet-700" : "text-orange-700";
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-ink-900">{title}</h3>
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        </div>
        <Award className={`h-4 w-4 ${accent === "violet" ? "text-violet-500" : "text-orange-500"}`} />
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-sm text-ink-500 italic text-center">No data yet</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {items.map((item, idx) => (
            <li key={item.id} className="flex items-center gap-4 px-5 py-3">
              <span className={`h-8 w-8 rounded-xl bg-white border border-ink-200 ring-2 ${ringColor} flex items-center justify-center text-xs font-bold ${numberColor} shrink-0 font-plate`}>
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-900 truncate">{item.primary}</p>
                <div className="mt-0.5">{item.secondary}</div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-plate text-sm font-bold text-ink-900 tabular">{item.metric}</p>
                <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold mt-0.5">{item.sub}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
