import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LeaveStatusBadge } from "@/components/primitives/RatingBadge";
import { LeaveRequestForm, CancelLeaveButton } from "@/components/driver/LeaveRequestForm";
import type { DriverLeaveRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function days(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
}

export default async function DriverLeavePage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  let leave: DriverLeaveRow[] = [];
  if (driver) {
    const { data } = await supabase
      .schema("app")
      .from("driver_leave")
      .select("*")
      .eq("driver_id", driver.id)
      .order("start_date", { ascending: false })
      .returns<DriverLeaveRow[]>();
    leave = data ?? [];
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500">
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink-900">My leave</h1>
        <p className="text-sm text-ink-500 mt-0.5">Request time off and track approvals</p>
      </div>

      <LeaveRequestForm />

      <section>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-3 px-1">My requests</p>
        {leave.length === 0 ? (
          <div className="rounded-3xl bg-white border border-ink-200/70 py-10 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
              <CalendarDays className="h-5 w-5 text-ink-400" />
            </div>
            <p className="text-sm text-ink-700 font-semibold">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leave.map((l) => (
              <div key={l.id} className="rounded-2xl bg-white border border-ink-200/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink-900 capitalize">{l.leave_type} leave</p>
                  <LeaveStatusBadge status={l.status} />
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {fmt(l.start_date)} – {fmt(l.end_date)} · {days(l.start_date, l.end_date)} day
                  {days(l.start_date, l.end_date) === 1 ? "" : "s"}
                </p>
                {l.reason && <p className="text-xs text-ink-600 mt-1.5">{l.reason}</p>}
                {l.status === "rejected" && l.review_notes && (
                  <p className="text-xs text-rose-600 mt-1.5">Note: {l.review_notes}</p>
                )}
                {l.status === "pending" && (
                  <div className="mt-2 flex justify-end">
                    <CancelLeaveButton leaveId={l.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
