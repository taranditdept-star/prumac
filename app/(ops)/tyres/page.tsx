import Link from "next/link";
import { Plus, CircleDot, AlertTriangle, Disc3, Warehouse } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TyreEventButton } from "@/components/ops/TyreEventButton";
import type { CountryCode, TyreRow, TyreStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

// Tyres legally need >= 1.6mm tread; warn approaching that.
const LOW_TREAD_MM = 3;

type TyreWithVehicle = TyreRow & {
  vehicles: { plate_number: string; plate_country: CountryCode } | null;
};

const STATUS_STYLE: Record<TyreStatus, string> = {
  in_service: "bg-emerald-50 text-emerald-700 border-emerald-200",
  spare: "bg-sky-50 text-sky-700 border-sky-200",
  in_store: "bg-ink-100 text-ink-600 border-ink-200",
  scrapped: "bg-rose-50 text-rose-700 border-rose-200",
};

export default async function TyresPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: tyres } = await supabase
    .schema("app")
    .from("tyres")
    .select("*, vehicles(plate_number, plate_country)")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<TyreWithVehicle[]>();

  const list = tyres ?? [];
  // Stats over the whole table (not just the displayed page).
  const { data: statRows } = await supabase
    .schema("app").from("tyres").select("status, tread_depth_mm").limit(20000);
  const all = (statRows ?? []) as { status: string; tread_depth_mm: number | null }[];
  const inService = all.filter((t) => t.status === "in_service");
  const inStore = all.filter((t) => t.status === "in_store" || t.status === "spare");
  const lowTread = all.filter(
    (t) => t.status !== "scrapped" && t.tread_depth_mm != null && Number(t.tread_depth_mm) <= LOW_TREAD_MM,
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Tyres</h1>
          <p className="text-sm text-ink-500 mt-1">Fitment, rotation and tread tracking</p>
        </div>
        <Link
          href="/tyres/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Add tyre
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={CircleDot} tone="brand" label="Total tyres" value={all.length.toString()} />
        <Tile icon={Disc3} tone="emerald" label="In service" value={inService.length.toString()} />
        <Tile icon={Warehouse} tone="sky" label="In store / spare" value={inStore.length.toString()} />
        <Tile icon={AlertTriangle} tone="rose" label={`Low tread (≤${LOW_TREAD_MM}mm)`} value={lowTread.length.toString()} />
      </div>

      {all.length > list.length && (
        <p className="text-xs text-ink-500">Showing the latest {list.length.toLocaleString()} of {all.length.toLocaleString()}.</p>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <CircleDot className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No tyres yet</p>
          <p className="text-xs text-ink-500 mt-1 mb-4">Register a tyre to start tracking fitment and tread.</p>
          <Link
            href="/tyres/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            Add tyre
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Tyre</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Position</th>
                <th className="px-6 py-3 text-right">Tread</th>
                <th className="px-6 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((t) => {
                const tread = t.tread_depth_mm != null ? Number(t.tread_depth_mm) : null;
                const low = tread != null && tread <= LOW_TREAD_MM && t.status !== "scrapped";
                const label = [t.brand, t.size, t.serial_number].filter(Boolean).join(" · ") || "Tyre";
                return (
                  <tr key={t.id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink-900">{t.brand ?? "—"}</p>
                      <p className="text-xs text-ink-400 font-plate mt-0.5">
                        {[t.size, t.serial_number].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[t.status]}`}>
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {t.vehicles ? (
                        <PlateBadge plate={t.vehicles.plate_number} country={t.vehicles.plate_country} size="sm" />
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-plate text-xs text-ink-700">{t.position ?? "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-plate text-xs font-bold ${low ? "text-rose-600" : "text-ink-900"}`}>
                        {tread != null ? `${tread.toFixed(1)} mm` : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <TyreEventButton tyre={{ id: t.id, label, vehicle_id: t.vehicle_id }} />
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
  tone: "brand" | "emerald" | "sky" | "rose";
  label: string;
  value: string;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
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
