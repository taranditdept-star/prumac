import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToProfiles } from "@/lib/notifications/push";

/**
 * Post a message into the "PRUMAC Team" group as Chitsano and push it to every
 * member. RLS forbids client-side chitsano inserts, so this always runs
 * server-side with the service client. Fire-and-forget — never throws into the
 * caller's request path.
 */
export async function postToTeamGroup(
  body: string,
  opts?: { pushTitle?: string; pushBody?: string },
): Promise<void> {
  try {
    const service = createServiceClient();
    const app = service.schema("app");

    const { data: team } = await app
      .from("conversations")
      .select("id, title")
      .eq("is_team", true)
      .maybeSingle<{ id: string; title: string | null }>();
    if (!team) return;

    const { error } = await app
      .from("messages")
      .insert({ conversation_id: team.id, sender_id: null, sender_kind: "chitsano", body });
    if (error) return;

    const { data: members } = await app
      .from("conversation_members")
      .select("profile_id")
      .eq("conversation_id", team.id)
      .returns<{ profile_id: string }[]>();

    await sendPushToProfiles((members ?? []).map((m) => m.profile_id), {
      title: opts?.pushTitle ?? team.title ?? "Team chat",
      body: opts?.pushBody ?? "Chitsano AI posted an update",
      url: "/home",
      tag: `chat-${team.id}`,
      kind: "chat",
    });
  } catch {
    /* announcements are best-effort */
  }
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

/**
 * Announce newly-opened faults into the team group. The operator asked for every
 * fault to be surfaced; callers pass only faults that are genuinely NEW (a
 * carried-over "still broken" fault is deduped upstream and never lands here).
 */
export async function announceFaultsToTeam(
  faults: { id: string; title: string; severity: string }[],
): Promise<void> {
  if (!faults.length) return;
  try {
    const service = createServiceClient();
    const app = service.schema("app");

    // Enrich with the vehicle plate so the message is meaningful.
    const { data: rows } = await app
      .from("faults")
      .select("id, title, severity, vehicles(plate_number)")
      .in("id", faults.map((f) => f.id))
      .returns<{ id: string; title: string; severity: string; vehicles: { plate_number: string } | null }[]>();

    const list = (rows ?? []).length ? rows! : faults.map((f) => ({ ...f, vehicles: null }));
    const worst = list.reduce((m, f) => Math.max(m, SEVERITY_RANK[f.severity] ?? 0), 0);
    const icon = worst >= 2 ? "🚨" : "🛠️";

    let body: string;
    if (list.length === 1) {
      const f = list[0];
      const plate = f.vehicles?.plate_number ? ` on ${f.vehicles.plate_number}` : "";
      body = `${icon} New fault reported${plate}: ${f.title} (${f.severity}). Please check the Faults board.`;
    } else {
      const lines = list
        .slice(0, 8)
        .map((f) => `• ${f.vehicles?.plate_number ? `${f.vehicles.plate_number} — ` : ""}${f.title} (${f.severity})`);
      const more = list.length > 8 ? `\n…and ${list.length - 8} more.` : "";
      body = `${icon} ${list.length} new faults reported:\n${lines.join("\n")}${more}\nPlease check the Faults board.`;
    }

    await postToTeamGroup(body, {
      pushBody: list.length === 1 ? `New fault: ${list[0].title}` : `${list.length} new faults reported`,
    });
  } catch {
    /* best-effort */
  }
}
