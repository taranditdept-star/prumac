import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AttendanceControl } from "./AttendanceControl";

/** Today's date as the local Africa/Harare day (matches fn_mark_attendance). */
function harareToday(): string {
  // en-CA formats as YYYY-MM-DD, which matches a Postgres `date`.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

function harareTodayLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Harare",
  });
}

/**
 * Daily attendance check-in strip. Shows a prominent "Mark Attendance" button
 * until the user checks in for the day, then a compact confirmation. Rendered
 * at the top of the driver home and the manager dashboard.
 */
export async function AttendanceBanner() {
  const profile = await requireAuth();
  const supabase = await createClient();
  const today = harareToday();

  const { data } = await supabase
    .schema("app")
    .from("attendance")
    .select("marked_at")
    .eq("profile_id", profile.id)
    .eq("attendance_date", today)
    .maybeSingle<{ marked_at: string }>();

  return <AttendanceControl initialMarkedAt={data?.marked_at ?? null} todayLabel={harareTodayLabel()} />;
}
