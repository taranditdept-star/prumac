import Link from "next/link";
import { ArrowLeft, CalendarClock, AlertTriangle, ListChecks } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { ScanDueButton, CompletePmButton, PmPlanForm } from "@/components/ops/PmSchedule";
import type { CountryCode, UpcomingMaintenanceRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function fmtKm(n: number | null): string {
  if (n == null) return "—";
  return `${Math.abs(n).toLocaleString()} km ${n < 0 ? "over" : "left"}`;
}
function fmtDays(n: number | null): string {
  if (n == null) return "—";
  return `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"} ${n < 0 ? "over" : "left"}`;
}

export default async function ServiceSchedulePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: upcoming }, { data: vehicles }] = await Promise.all([
    supabase
      .schema("app")
      .rpc("fn_upcoming_maintenance", { p_within_km: 2000, p_within_days: 30 })
      .returns<UpcomingMaintenanceRow[]>(),
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model")
      .neq("status", "decommissioned")
      .order("plate_number")
      .returns<{ id: string; plate_number: string; plate_country: CountryCode; make: string; model: string }[]>(),
  ]);

  const list = Array.isArray(upcoming) ? upcoming : [];
  const overdue = list.filter((r) => r.is_overdue);
  const dueSoon = list.filter((r) => !r.is_overdue);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/maintenance"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to maintenance
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Service schedule</h1>
          <p className="text-sm text-ink-500 mt-1">
            Upcoming and overdue preventive maintenance across the fleet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScanDueButton />
          <PmPlanForm vehicles={vehicles ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile icon={AlertTriangle} tone="rose" label="Overdue" value={overdue.length.toString()} />
        <Tile icon={CalendarClock} tone="amber" label="Due soon" value={dueSoon.length.toString()} />
        <Tile icon={ListChecks} tone="brand" label="Items tracked" value={list.length.toString()} />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <CalendarClock className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">Nothing due in the next 2,000 km / 30 days</p>
          <p className="text-xs text-ink-500 mt-1">
            Set a service interval and last-service reading on a vehicle, or add a recurring task, to populate this view.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Task</th>
                <th className="px-6 py-3 text-left">Distance</th>
                <th className="px-6 py-3 text-left">Time</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((r, i) => (
                <tr key={`${r.vehicle_id}-${r.plan_id ?? "base"}-${i}`} className="hover:bg-ink-50/40 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/vehicles/${r.vehicle_id}`} className="block">
                      <PlateBadge plate={r.plate_number} country={r.plate_country} size="sm" />
                      <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                        {r.make} {r.model}
                      </p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-ink-800">{r.task_name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-400">{r.source}</span>
                  </td>
                  <td className="px-6 py-4 font-plate text-xs text-ink-700">{fmtKm(r.km_remaining)}</td>
                  <td className="px-6 py-4 font-plate text-xs text-ink-700">{fmtDays(r.days_remaining)}</td>
                  <td className="px-6 py-4">
                    {r.is_overdue ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Due soon
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.plan_id ? (
                      <CompletePmButton planId={r.plan_id} />
                    ) : (
                      <Link href="/maintenance/new" className="text-xs font-semibold text-orange-600 hover:underline">
                        Log service
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

function Tile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "rose" | "amber" | "brand";
  label: string;
  value: string;
}) {
  const t = {
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
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
