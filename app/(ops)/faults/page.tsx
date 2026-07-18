import Link from "next/link";
import { Wrench, ArrowUpRight, AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { FaultSeverityBadge, FaultStatusBadge } from "@/components/primitives/SeverityBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface FaultRow {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  category: string;
  title: string;
  reported_at: string;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function FaultsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: faults, error } = await supabase
    .schema("app")
    .from("faults")
    .select(`
      id, severity, status, category, title, reported_at,
      vehicles(plate_number, plate_country, make, model),
      drivers(profiles(full_name))
    `)
    .order("reported_at", { ascending: false })
    .limit(200)
    .returns<FaultRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load faults: {error.message}
        </div>
      </div>
    );
  }

  const list = faults ?? [];
  // Stats over the whole table (not just the displayed page).
  const { data: statRows } = await supabase
    .schema("app").from("faults").select("severity, status").limit(20000);
  const all = (statRows ?? []) as { severity: string; status: string }[];
  const open = all.filter((f) => f.status !== "resolved" && f.status !== "wont_fix");
  const stats = {
    open: open.length,
    critical: open.filter((f) => f.severity === "critical").length,
    inRepair: open.filter((f) => f.status === "in_repair").length,
    resolved: all.filter((f) => f.status === "resolved").length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Faults</h1>
        <p className="text-sm text-ink-500 mt-1">Reported vehicle problems and their status</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={AlertTriangle} tone="orange" label="Open" value={stats.open} />
        <StatTile icon={AlertOctagon} tone="rose" label="Critical" value={stats.critical} />
        <StatTile icon={Wrench} tone="amber" label="In repair" value={stats.inRepair} />
        <StatTile icon={CheckCircle2} tone="emerald" label="Resolved" value={stats.resolved} />
      </div>

      {all.length > list.length && (
        <p className="text-xs text-ink-500">Showing the latest {list.length.toLocaleString()} of {all.length.toLocaleString()}.</p>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-emerald-50 ring-4 ring-emerald-50/50 items-center justify-center mb-3">
            <Wrench className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No faults reported</p>
          <p className="text-xs text-ink-500 mt-1">Drivers report faults from their mobile home screen.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Severity</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Title</th>
                <th className="px-6 py-3 text-left">Category</th>
                <th className="px-6 py-3 text-left">Reported by</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Age</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((f) => (
                <tr key={f.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <FaultSeverityBadge severity={f.severity} />
                  </td>
                  <td className="px-6 py-4">
                    {f.vehicles && (
                      <Link href={`/faults/${f.id}`} className="block">
                        <PlateBadge
                          plate={f.vehicles.plate_number}
                          country={f.vehicles.plate_country}
                          size="sm"
                        />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {f.vehicles.make} {f.vehicles.model}
                        </p>
                      </Link>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-ink-900 truncate max-w-[260px]">{f.title}</p>
                  </td>
                  <td className="px-6 py-4 text-ink-600 capitalize">{f.category}</td>
                  <td className="px-6 py-4 text-ink-700">
                    {f.drivers?.profiles?.full_name ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <FaultStatusBadge status={f.status} />
                  </td>
                  <td className="px-6 py-4 text-xs text-ink-500">{timeAgo(f.reported_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/faults/${f.id}`}
                      className="inline-flex h-8 w-8 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
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

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "orange" | "rose" | "amber" | "emerald";
  label: string;
  value: number;
}) {
  const t = {
    orange: { bg: "bg-orange-500/10", text: "text-orange-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
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
