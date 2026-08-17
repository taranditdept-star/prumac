import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { getLoginActivity } from "@/lib/ops/login-activity";
import { sendPushToProfiles } from "@/lib/notifications/push";

// Proactive Chitsano: posts a morning briefing to the team group (who hasn't
// logged in, attendance, trips out, open faults) and pushes it to members.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  const app = sb.schema("app");

  const { data: team } = await app
    .from("conversations")
    .select("id, title")
    .eq("is_team", true)
    .maybeSingle<{ id: string; title: string | null }>();
  if (!team) return NextResponse.json({ ok: false, reason: "no team group" });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });

  const [login, openAcc, openFlt, activeTrips, marks, people] = await Promise.all([
    getLoginActivity(),
    app.from("accidents").select("id", { count: "exact", head: true }).in("status", ["reported", "investigating"]),
    app.from("faults").select("id", { count: "exact", head: true }).in("status", ["reported", "acknowledged", "in_repair"]),
    app.from("trips").select("id", { count: "exact", head: true }).in("status", ["in_progress", "paused"]),
    app.from("attendance").select("profile_id").eq("attendance_date", today).returns<{ profile_id: string }[]>(),
    app.from("profiles").select("id").eq("is_active", true).neq("role", "subsidiary_billing").returns<{ id: string }[]>(),
  ]);

  const notLoggedIn = login.summary.never + login.summary.dormant;
  const openAccidents = openAcc.count ?? 0;
  const openFaults = openFlt.count ?? 0;
  const onTrips = activeTrips.count ?? 0;
  const staffIds = new Set((people.data ?? []).map((p) => p.id));
  const staff = staffIds.size;
  // Count only attendance rows belonging to counted staff, so markedToday can
  // never exceed staff (avoids a contradictory "6/5 checked in — everyone's in").
  const markedToday = new Set((marks.data ?? []).map((m) => m.profile_id).filter((id) => staffIds.has(id))).size;
  const notCheckedIn = Math.max(staff - markedToday, 0);
  const nudge = login.rows
    .filter((r) => r.status === "never" || r.status === "dormant")
    .slice(0, 8)
    .map((r) => r.name);

  const body = [
    "🌅 Morning, team! Today's briefing:",
    "",
    `• 🔑 ${notLoggedIn} ${notLoggedIn === 1 ? "person hasn't" : "people haven't"} been signing in${nudge.length ? ` — please log in: ${nudge.join(", ")}` : ""}`,
    `• 🅿️ Attendance: ${markedToday}/${staff} checked in${notCheckedIn ? ` — ${notCheckedIn} still to mark` : " — everyone's in 🎉"}`,
    `• 🚗 ${onTrips} ${onTrips === 1 ? "vehicle is" : "vehicles are"} out on a trip`,
    `• 🛠️ ${openFaults} open ${openFaults === 1 ? "fault" : "faults"}${openFaults ? " — check the Faults board" : " 👍"}`,
    `• ⚠️ ${openAccidents} open ${openAccidents === 1 ? "accident" : "accidents"}${openAccidents ? " — please follow up" : ""}`,
    "",
    "Drive safe. Tag @Chitsano anytime to ask me something. 🫡",
  ].join("\n");

  const { error } = await app.from("messages").insert({ conversation_id: team.id, sender_id: null, sender_kind: "chitsano", body });
  if (error) return NextResponse.json({ ok: false, error: error.message });

  const { data: members } = await app
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", team.id)
    .returns<{ profile_id: string }[]>();
  await sendPushToProfiles((members ?? []).map((m) => m.profile_id), {
    title: team.title ?? "Team chat",
    body: "Chitsano AI posted the morning briefing",
    url: "/home",
    tag: `chat-${team.id}`,
    kind: "chat",
  });

  return NextResponse.json({ ok: true, posted: true, notLoggedIn, openFaults, openAccidents, onTrips, notCheckedIn });
}
