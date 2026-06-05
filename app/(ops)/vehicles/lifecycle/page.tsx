import Link from "next/link";
import { ArrowLeft, Banknote, TrendingDown, Wallet, Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { VehicleStatusBadge } from "@/components/primitives/VehicleStatusBadge";
import type { FleetDepreciationRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function LifecyclePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data } = await supabase.schema("app").rpc("fn_fleet_depreciation").returns<FleetDepreciationRow[]>();
  const rows = Array.isArray(data) ? data : [];

  const totalCost = rows.reduce((s, r) => s + Number(r.purchase_cost ?? 0), 0);
  const totalBook = rows.reduce((s, r) => s + Number(r.book_value ?? 0), 0);
  const totalDep = rows.reduce((s, r) => s + Number(r.accumulated_depreciation ?? 0), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to fleet
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Asset lifecycle &amp; depreciation</h1>
        <p className="text-sm text-ink-500 mt-1">Straight-line book values across vehicles with a purchase cost on file</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Banknote} tone="brand" label="Fleet cost" value={money(totalCost)} />
        <Tile icon={Wallet} tone="emerald" label="Net book value" value={money(totalBook)} />
        <Tile icon={TrendingDown} tone="amber" label="Accumulated dep." value={money(totalDep)} />
        <Tile icon={Gauge} tone="violet" label="Assets tracked" value={rows.length.toString()} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Banknote className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No costed assets yet</p>
          <p className="text-xs text-ink-500 mt-1">
            Add a purchase cost, acquisition date and useful life on a vehicle to start tracking depreciation.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Age</th>
                <th className="px-6 py-3 text-right">Cost</th>
                <th className="px-6 py-3 text-right">Depreciated</th>
                <th className="px-6 py-3 text-right">Book value</th>
                <th className="px-6 py-3 text-right">$/km</th>
                <th className="px-6 py-3 text-left w-40">Wear</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => {
                const pct = r.depreciation_pct != null ? Math.min(100, Number(r.depreciation_pct)) : 0;
                return (
                  <tr key={r.vehicle_id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/vehicles/${r.vehicle_id}`} className="block">
                        <PlateBadge plate={r.plate_number} country={r.plate_country} size="sm" />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {r.make} {r.model}
                        </p>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <VehicleStatusBadge status={r.status} />
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-600">
                      {r.age_years != null ? `${Number(r.age_years).toFixed(1)} yr` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">{money(r.purchase_cost)}</td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-amber-700">
                      {money(r.accumulated_depreciation)}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs font-bold text-ink-900">
                      {money(r.book_value)}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-600">
                      {r.cost_per_km != null ? `$${Number(r.cost_per_km).toFixed(3)}` : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-rose-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-plate text-ink-500 w-9 text-right">{pct.toFixed(0)}%</span>
                      </div>
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

function Tile({
  icon: Icon,
  tone,
  label,
  value,
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
