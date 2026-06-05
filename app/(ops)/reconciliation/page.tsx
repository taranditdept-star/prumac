import Link from "next/link";
import { FileText, ArrowUpRight, CheckCircle2, AlertTriangle, ShieldAlert, AlertOctagon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { ReconciliationBadge } from "@/components/primitives/ReconciliationBadge";
import type { CountryCode, ReconciliationStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ReconciliationRow {
  id: string;
  trip_id: string;
  odometer_km: number;
  gps_km: number;
  difference_km: number;
  variance_pct: number;
  status: ReconciliationStatus;
  reason_codes: string[];
  ping_count: number;
  computed_at: string;
  trips: {
    id: string;
    route_description: string | null;
    origin_label: string | null;
    destination_label: string | null;
    completed_at: string | null;
    vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
    drivers: { profiles: { full_name: string | null } | null } | null;
  } | null;
}

export default async function ReconciliationPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .schema("app")
    .from("reconciliations")
    .select(`
      id, trip_id, odometer_km, gps_km, difference_km, variance_pct,
      status, reason_codes, ping_count, computed_at,
      trips(
        id, route_description, origin_label, destination_label, completed_at,
        vehicles(plate_number, plate_country, make, model),
        drivers(profiles(full_name))
      )
    `)
    .eq("is_current", true)
    .order("computed_at", { ascending: false })
    .limit(200)
    .returns<ReconciliationRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load reconciliations: {error.message}
        </div>
      </div>
    );
  }

  const list = rows ?? [];
  const stats = {
    accepted: list.filter((r) => r.status === "accepted").length,
    warning: list.filter((r) => r.status === "warning").length,
    flagged: list.filter((r) => r.status === "flagged").length,
    critical: list.filter((r) => r.status === "critical").length,
  };

  const order = { critical: 0, flagged: 1, warning: 2, accepted: 3 } as const;
  const sorted = [...list].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Reconciliation</h1>
        <p className="text-sm text-ink-500 mt-1">
          Odometer vs GPS distance — review flagged trips before billing
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={CheckCircle2} tone="emerald" label="Accepted" value={stats.accepted} />
        <StatTile icon={AlertTriangle} tone="amber" label="Warning" value={stats.warning} />
        <StatTile icon={ShieldAlert} tone="rose" label="Flagged" value={stats.flagged} />
        <StatTile icon={AlertOctagon} tone="crimson" label="Critical" value={stats.critical} />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No reconciliations yet</p>
          <p className="text-xs text-ink-500 mt-1">
            Once a trip is completed, the reconciliation engine runs automatically.
          </p>
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
                <th className="px-6 py-3 text-right">Odometer</th>
                <th className="px-6 py-3 text-right">GPS</th>
                <th className="px-6 py-3 text-right">Δ</th>
                <th className="px-6 py-3 text-right">Variance</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {sorted.map((r) => {
                const variancePct = (Number(r.variance_pct) * 100).toFixed(1);
                const t = r.trips;
                return (
                  <tr key={r.id} className="hover:bg-ink-50/40 transition-colors group">
                    <td className="px-6 py-4">
                      <ReconciliationBadge status={r.status} />
                    </td>
                    <td className="px-6 py-4">
                      {t?.vehicles ? (
                        <Link href={`/reconciliation/${r.trip_id}`} className="block">
                          <PlateBadge
                            plate={t.vehicles.plate_number}
                            country={t.vehicles.plate_country}
                            size="sm"
                          />
                          <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                            {t.vehicles.make} {t.vehicles.model}
                          </p>
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-ink-900 truncate max-w-[160px]">
                        {t?.drivers?.profiles?.full_name ?? "Unknown"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-ink-700 truncate max-w-[240px]">
                        {t?.route_description ||
                          (t?.origin_label && t?.destination_label
                            ? `${t.origin_label} → ${t.destination_label}`
                            : "—")}
                      </p>
                      {r.reason_codes.length > 0 && (
                        <p className="text-[10px] uppercase tracking-wider text-rose-600 font-bold mt-1">
                          {r.reason_codes.join(" · ").replace(/_/g, " ")}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-700 font-semibold">
                      {Number(r.odometer_km).toLocaleString()} km
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-700 font-semibold">
                      {Number(r.gps_km).toLocaleString()} km
                    </td>
                    <td className={`px-6 py-4 text-right font-plate text-xs font-bold ${Number(r.difference_km) >= 0 ? "text-ink-700" : "text-rose-600"}`}>
                      {Number(r.difference_km) >= 0 ? "+" : ""}
                      {Number(r.difference_km).toFixed(1)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-plate text-xs font-bold ${
                        r.status === "accepted"
                          ? "text-emerald-700"
                          : r.status === "warning"
                            ? "text-amber-700"
                            : "text-rose-700"
                      }`}>
                        {variancePct}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/reconciliation/${r.trip_id}`}
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
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber" | "rose" | "crimson";
  label: string;
  value: number;
}) {
  const t = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
    crimson: { bg: "bg-rose-600/10", text: "text-rose-700" },
  }[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
      <div className={`absolute top-0 right-0 h-20 w-20 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${t.text} tabular mt-2`}>{value}</p>
    </div>
  );
}
