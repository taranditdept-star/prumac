import Link from "next/link";
import { ArrowLeft, CalendarDays, UserCheck, UserX, Plane, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LeaveStatusBadge } from "@/components/primitives/RatingBadge";
import { LeaveReviewButtons } from "@/components/ops/LeaveReviewButtons";
import type { DriverAvailabilityRow, LeaveType, LeaveStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface LeaveRow {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  reason: string | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function days(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
}

const REASON_STYLE: Record<DriverAvailabilityRow["reason"], { dot: string; label: string }> = {
  available: { dot: "bg-emerald-500", label: "Available" },
  on_trip: { dot: "bg-sky-500", label: "On trip" },
  on_leave: { dot: "bg-amber-500", label: "On leave" },
};

export default async function OpsLeavePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: pending }, { data: avail }, { data: recent }] = await Promise.all([
    supabase
      .schema("app")
      .from("driver_leave")
      .select("id, leave_type, start_date, end_date, status, reason, drivers(profiles(full_name))")
      .eq("status", "pending")
      .order("start_date")
      .returns<LeaveRow[]>(),
    supabase.schema("app").rpc("fn_driver_availability").returns<DriverAvailabilityRow[]>(),
    supabase
      .schema("app")
      .from("driver_leave")
      .select("id, leave_type, start_date, end_date, status, reason, drivers(profiles(full_name))")
      .in("status", ["approved", "rejected", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(20)
      .returns<LeaveRow[]>(),
  ]);

  const pendingList = pending ?? [];
  const availList = Array.isArray(avail) ? avail : [];
  const availableCount = availList.filter((a) => a.is_available).length;
  const onLeaveCount = availList.filter((a) => a.reason === "on_leave").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to drivers
      </Link>
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Leave &amp; availability</h1>
        <p className="text-sm text-ink-500 mt-1">Approve requests and see who is available to dispatch today</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Clock} tone="amber" label="Pending requests" value={pendingList.length.toString()} />
        <Tile icon={UserCheck} tone="emerald" label="Available now" value={availableCount.toString()} />
        <Tile icon={Plane} tone="sky" label="On leave today" value={onLeaveCount.toString()} />
        <Tile icon={UserX} tone="violet" label="Active drivers" value={availList.length.toString()} />
      </div>

      {/* Pending approvals */}
      <section>
        <header className="mb-3">
          <h2 className="text-lg font-bold text-ink-900">Pending approvals</h2>
        </header>
        {pendingList.length === 0 ? (
          <div className="rounded-2xl bg-white border border-ink-200/70 py-12 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
              <CalendarDays className="h-5 w-5 text-ink-400" />
            </div>
            <p className="text-sm font-semibold text-ink-900">No pending leave requests</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-6 py-3 text-left">Driver</th>
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-left">Dates</th>
                  <th className="px-6 py-3 text-right">Days</th>
                  <th className="px-6 py-3 text-left">Reason</th>
                  <th className="px-6 py-3 text-right w-48">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {pendingList.map((l) => (
                  <tr key={l.id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-6 py-4 font-medium text-ink-900">
                      {l.drivers?.profiles?.full_name ?? "Driver"}
                    </td>
                    <td className="px-6 py-4 capitalize text-ink-600">{l.leave_type}</td>
                    <td className="px-6 py-4 text-ink-700">
                      {fmt(l.start_date)} – {fmt(l.end_date)}
                    </td>
                    <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">{days(l.start_date, l.end_date)}</td>
                    <td className="px-6 py-4 text-ink-600 truncate max-w-[220px]">{l.reason ?? "—"}</td>
                    <td className="px-6 py-4">
                      <LeaveReviewButtons leaveId={l.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {/* Availability board */}
      <section>
        <header className="mb-3">
          <h2 className="text-lg font-bold text-ink-900">Availability today</h2>
        </header>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {availList.map((a) => {
            const st = REASON_STYLE[a.reason];
            return (
              <div key={a.driver_id} className="rounded-2xl bg-white border border-ink-200/70 p-4 flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${st.dot} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900 truncate">{a.full_name ?? "Driver"}</p>
                  <p className="text-xs text-ink-500">
                    {st.label}
                    {a.reason === "on_leave" && a.leave_type ? ` · ${a.leave_type}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent decisions */}
      {recent && recent.length > 0 && (
        <section>
          <header className="mb-3">
            <h2 className="text-lg font-bold text-ink-900">Recent decisions</h2>
          </header>
          <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <tbody className="divide-y divide-ink-100">
                {recent.map((l) => (
                  <tr key={l.id} className="hover:bg-ink-50/40 transition-colors">
                    <td className="px-6 py-3 font-medium text-ink-900">{l.drivers?.profiles?.full_name ?? "Driver"}</td>
                    <td className="px-6 py-3 capitalize text-ink-600">{l.leave_type}</td>
                    <td className="px-6 py-3 text-ink-700">
                      {fmt(l.start_date)} – {fmt(l.end_date)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <LeaveStatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
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
  tone: "amber" | "emerald" | "sky" | "violet";
  label: string;
  value: string;
}) {
  const t = {
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
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
