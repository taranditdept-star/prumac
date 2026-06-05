import Link from "next/link";
import { Plus, Fuel, Droplets, Gauge, DollarSign } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface FuelRow {
  id: string;
  filled_at: string;
  odometer_km: number | null;
  litres: number;
  price_per_litre: number | null;
  total_cost: number;
  currency: string;
  station: string | null;
  payment_method: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function money(n: number, c = "USD"): string {
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function FuelPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .schema("app")
    .from("fuel_logs")
    .select(`
      id, filled_at, odometer_km, litres, price_per_litre, total_cost, currency, station, payment_method,
      vehicles(plate_number, plate_country, make, model)
    `)
    .order("filled_at", { ascending: false })
    .limit(300)
    .returns<FuelRow[]>();

  const list = rows ?? [];
  const month = new Date();
  month.setDate(1);
  const mtd = list.filter((r) => new Date(r.filled_at) >= month);
  const stats = {
    fills: list.length,
    litres: list.reduce((s, r) => s + Number(r.litres), 0),
    spendMtd: mtd.reduce((s, r) => s + Number(r.total_cost), 0),
    avgPrice:
      list.length > 0
        ? list.reduce((s, r) => s + Number(r.price_per_litre ?? 0), 0) /
          Math.max(1, list.filter((r) => r.price_per_litre != null).length)
        : 0,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Fuel</h1>
          <p className="text-sm text-ink-500 mt-1">Fills, spend and consumption across the fleet</p>
        </div>
        <Link
          href="/fuel/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Log fuel
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Fuel} tone="brand" label="Total fills" value={stats.fills.toString()} />
        <Tile icon={Droplets} tone="sky" label="Litres logged" value={`${Math.round(stats.litres).toLocaleString()} L`} />
        <Tile icon={DollarSign} tone="violet" label="Spend (MTD)" value={money(stats.spendMtd)} />
        <Tile icon={Gauge} tone="emerald" label="Avg price / L" value={stats.avgPrice ? `$${stats.avgPrice.toFixed(2)}` : "—"} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Fuel className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No fuel logs yet</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">Log a fill to start tracking consumption.</p>
          <Link
            href="/fuel/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Log fuel
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Filled</th>
                <th className="px-6 py-3 text-left">Station</th>
                <th className="px-6 py-3 text-left">Payment</th>
                <th className="px-6 py-3 text-right">Odometer</th>
                <th className="px-6 py-3 text-right">Litres</th>
                <th className="px-6 py-3 text-right">Price/L</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/40 transition-colors">
                  <td className="px-6 py-4">
                    {r.vehicles && (
                      <>
                        <PlateBadge plate={r.vehicles.plate_number} country={r.vehicles.plate_country} size="sm" />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {r.vehicles.make} {r.vehicles.model}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink-700">{fmtDate(r.filled_at)}</td>
                  <td className="px-6 py-4 text-ink-600 truncate max-w-[160px]">{r.station ?? "—"}</td>
                  <td className="px-6 py-4 text-ink-600 capitalize">{r.payment_method?.replace("_", " ") ?? "—"}</td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">
                    {r.odometer_km != null ? `${r.odometer_km.toLocaleString()} km` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">{Number(r.litres).toFixed(1)} L</td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-600">
                    {r.price_per_litre != null ? `$${Number(r.price_per_litre).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs font-bold text-ink-900">
                    {money(r.total_cost, r.currency)}
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
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "sky" | "emerald" | "violet";
  label: string;
  value: string;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
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
