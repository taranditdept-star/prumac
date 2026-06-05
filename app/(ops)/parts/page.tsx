import Link from "next/link";
import { Plus, Package, AlertTriangle, Boxes, DollarSign } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PartMovementButton } from "@/components/ops/PartMovementButton";
import type { CountryCode, PartRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function money(n: number | null, c = "USD"): string {
  if (n == null) return "—";
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PartsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: parts }, { data: vehicles }] = await Promise.all([
    supabase
      .schema("app")
      .from("parts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .returns<PartRow[]>(),
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country")
      .neq("status", "decommissioned")
      .order("plate_number")
      .returns<{ id: string; plate_number: string; plate_country: CountryCode }[]>(),
  ]);

  const list = parts ?? [];
  const low = list.filter((p) => Number(p.current_stock) <= Number(p.reorder_level));
  const stockValue = list.reduce((s, p) => s + Number(p.current_stock) * Number(p.unit_cost ?? 0), 0);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Parts &amp; inventory</h1>
          <p className="text-sm text-ink-500 mt-1">Spares catalogue with running stock levels</p>
        </div>
        <Link
          href="/parts/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Add part
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Package} tone="brand" label="Catalogue" value={list.length.toString()} />
        <Tile icon={Boxes} tone="sky" label="Units in stock" value={Math.round(list.reduce((s, p) => s + Number(p.current_stock), 0)).toLocaleString()} />
        <Tile icon={AlertTriangle} tone="rose" label="Low stock" value={low.length.toString()} />
        <Tile icon={DollarSign} tone="violet" label="Stock value" value={money(stockValue)} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Package className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No parts yet</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">Add a part to start tracking inventory.</p>
          <Link
            href="/parts/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Add part
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Part</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Supplier</th>
                <th className="px-6 py-3 text-right">In stock</th>
                <th className="px-6 py-3 text-right">Reorder at</th>
                <th className="px-6 py-3 text-right">Unit cost</th>
                <th className="px-6 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((p) => {
                const isLow = Number(p.current_stock) <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink-900">{p.name}</p>
                      {p.sku && <p className="text-xs text-ink-400 font-plate mt-0.5">{p.sku}</p>}
                    </td>
                    <td className="px-6 py-4 capitalize text-ink-600">{p.category.replace("_", " ")}</td>
                    <td className="px-6 py-4 text-ink-600 truncate max-w-[160px]">{p.supplier ?? "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 font-plate text-xs font-bold ${
                          isLow ? "text-rose-600" : "text-ink-900"
                        }`}
                      >
                        {isLow && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                        {Number(p.current_stock).toLocaleString()} {p.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-500">
                      {Number(p.reorder_level).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">
                      {money(p.unit_cost, p.currency)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <PartMovementButton
                        part={{ id: p.id, name: p.name, unit: p.unit, current_stock: Number(p.current_stock) }}
                        vehicles={vehicles ?? []}
                      />
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
  tone: "brand" | "sky" | "rose" | "violet";
  label: string;
  value: string;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
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
