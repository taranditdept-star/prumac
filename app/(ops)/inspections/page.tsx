import Link from "next/link";
import { ClipboardCheck, ArrowUpRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface InspectionRow {
  id: string;
  trip_id: string | null;
  type: "pre_trip" | "post_trip" | "daily_checklist";
  overall_result: "pass" | "attention" | "fail";
  odometer_km: number;
  completed_at: string;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function InspectionsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: inspections, error } = await supabase
    .schema("app")
    .from("inspections")
    .select(`
      id, trip_id, type, overall_result, odometer_km, completed_at,
      vehicles(plate_number, plate_country, make, model),
      drivers(profiles(full_name))
    `)
    .order("completed_at", { ascending: false })
    .limit(200)
    .returns<InspectionRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load inspections: {error.message}
        </div>
      </div>
    );
  }

  const list = inspections ?? [];
  // Stats over the whole table (not just the displayed page).
  const { data: statRows } = await supabase
    .schema("app").from("inspections").select("overall_result").limit(20000);
  const all = (statRows ?? []) as { overall_result: "pass" | "attention" | "fail" }[];
  const stats = {
    total: all.length,
    pass: all.filter((i) => i.overall_result === "pass").length,
    attention: all.filter((i) => i.overall_result === "attention").length,
    fail: all.filter((i) => i.overall_result === "fail").length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Inspections</h1>
        <p className="text-sm text-ink-500 mt-1">
          Pre-trip, post-trip and standalone vehicle checklists from driver mobile devices
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={ClipboardCheck} tone="brand" label="Total" value={stats.total} />
        <Tile icon={CheckCircle2} tone="emerald" label="Pass" value={stats.pass} />
        <Tile icon={AlertCircle} tone="amber" label="Attention" value={stats.attention} />
        <Tile icon={XCircle} tone="rose" label="Fail" value={stats.fail} />
      </div>

      {stats.total > list.length && (
        <p className="text-xs text-ink-500">Showing the latest {list.length.toLocaleString()} of {stats.total.toLocaleString()}.</p>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <ClipboardCheck className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No inspections yet</p>
          <p className="text-xs text-ink-500 mt-1">
            Drivers complete a pre-trip inspection before starting each trip.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Result</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Driver</th>
                <th className="px-6 py-3 text-right">Odometer</th>
                <th className="px-6 py-3 text-left">When</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((i) => (
                <tr key={i.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <ResultPill result={i.overall_result} />
                  </td>
                  <td className="px-6 py-4 text-ink-700">
                    <span className="inline-flex items-center rounded-md bg-ink-100 px-1.5 py-0.5 text-xs font-bold text-ink-700 capitalize">
                      {i.type.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {i.vehicles && (
                      i.trip_id ? (
                        <Link href={`/trips/${i.trip_id}`} className="block">
                          <PlateBadge
                            plate={i.vehicles.plate_number}
                            country={i.vehicles.plate_country}
                            size="sm"
                          />
                          <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                            {i.vehicles.make} {i.vehicles.model}
                          </p>
                        </Link>
                      ) : (
                        <div className="block">
                          <PlateBadge
                            plate={i.vehicles.plate_number}
                            country={i.vehicles.plate_country}
                            size="sm"
                          />
                          <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                            {i.vehicles.make} {i.vehicles.model}
                          </p>
                        </div>
                      )
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink-700">
                    {i.drivers?.profiles?.full_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700 font-semibold">
                    {i.odometer_km.toLocaleString()} km
                  </td>
                  <td className="px-6 py-4 text-xs text-ink-500">{fmt(i.completed_at)}</td>
                  <td className="px-6 py-4 text-right">
                    {i.trip_id && (
                      <Link
                        href={`/trips/${i.trip_id}`}
                        className="inline-flex h-8 w-8 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultPill({ result }: { result: "pass" | "attention" | "fail" }) {
  const cfg = {
    pass:      { label: "Pass",      bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    attention: { label: "Attention", bg: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
    fail:      { label: "Fail",      bg: "bg-rose-50 text-rose-700 border-rose-200",          dot: "bg-rose-500" },
  }[result];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "emerald" | "amber" | "rose";
  label: string;
  value: number;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
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
