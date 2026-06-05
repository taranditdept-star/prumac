import Link from "next/link";
import { AlertOctagon, ArrowUpRight, AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { AccidentSeverityBadge, AccidentStatusBadge } from "@/components/primitives/SeverityBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface AccidentRow {
  id: string;
  severity: "minor" | "moderate" | "severe" | "fatal";
  status: string;
  location_description: string;
  occurred_at: string;
  injuries: boolean;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function AccidentsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: accidents, error } = await supabase
    .schema("app")
    .from("accidents")
    .select(`
      id, severity, status, location_description, occurred_at, injuries,
      vehicles(plate_number, plate_country, make, model),
      drivers(profiles(full_name))
    `)
    .order("occurred_at", { ascending: false })
    .limit(200)
    .returns<AccidentRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load accidents: {error.message}
        </div>
      </div>
    );
  }

  const list = accidents ?? [];
  const open = list.filter((a) => a.status !== "closed");
  const stats = {
    open: open.length,
    investigating: open.filter((a) => a.status === "investigating").length,
    severePlus: list.filter((a) => a.severity === "severe" || a.severity === "fatal").length,
    closed: list.filter((a) => a.status === "closed").length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Accidents</h1>
        <p className="text-sm text-ink-500 mt-1">Reported incidents and investigation status</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={AlertOctagon} tone="rose" label="Open" value={stats.open} />
        <StatTile icon={Search} tone="amber" label="Investigating" value={stats.investigating} />
        <StatTile icon={AlertTriangle} tone="crimson" label="Severe+" value={stats.severePlus} />
        <StatTile icon={ShieldCheck} tone="emerald" label="Closed" value={stats.closed} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-emerald-50 ring-4 ring-emerald-50/50 items-center justify-center mb-3">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No accidents on file</p>
          <p className="text-xs text-ink-500 mt-1">Drivers report accidents from their mobile home screen.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Severity</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Location</th>
                <th className="px-6 py-3 text-left">Driver</th>
                <th className="px-6 py-3 text-left">When</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((a) => (
                <tr key={a.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <AccidentSeverityBadge severity={a.severity} />
                      {a.injuries && (
                        <span className="inline-flex items-center rounded-md bg-rose-100 text-rose-800 px-1.5 py-0.5 text-[10px] font-bold">
                          INJURIES
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {a.vehicles && (
                      <Link href={`/accidents/${a.id}`} className="block">
                        <PlateBadge
                          plate={a.vehicles.plate_number}
                          country={a.vehicles.plate_country}
                          size="sm"
                        />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {a.vehicles.make} {a.vehicles.model}
                        </p>
                      </Link>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-ink-700 truncate max-w-[280px]">{a.location_description}</p>
                  </td>
                  <td className="px-6 py-4 text-ink-700">
                    {a.drivers?.profiles?.full_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-xs text-ink-500">{fmtDate(a.occurred_at)}</td>
                  <td className="px-6 py-4">
                    <AccidentStatusBadge status={a.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/accidents/${a.id}`}
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
  tone: "rose" | "amber" | "crimson" | "emerald";
  label: string;
  value: number;
}) {
  const t = {
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    crimson: { bg: "bg-rose-600/10", text: "text-rose-700" },
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
