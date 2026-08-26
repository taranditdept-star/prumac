import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { postToTeamGroup } from "@/lib/chat/announce";
import { runAllWatchers, shouldAnnounce, type Finding, type Level } from "@/lib/chitsano/watchers";

/**
 * Chitsano's rounds.
 *
 * Runs the watchers, works out which findings are actually worth saying, posts
 * one grouped message, and remembers what it said. Findings that have gone away
 * are closed off so they can be raised freshly if they come back.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ICON: Record<Level, string> = { urgent: "🔴", warn: "🟠", info: "🔵" };
const ORDER: Record<Level, number> = { urgent: 0, warn: 1, info: 2 };
const HEADING: Record<string, string> = {
  documents: "Vehicle papers",
  driver_papers: "Driver papers",
  receivables: "Money owed",
  service_due: "Servicing",
  odometer_check: "Figures that look wrong",
  dormant_drivers: "App use",
  missing_mileage: "Trip records",
};

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = createServiceClient().schema("app");
  const findings = await runAllWatchers();

  const { data: existing } = await app
    .from("chitsano_alerts")
    .select("id, watcher, subject_key, level, last_announced_at, resolved_at")
    .returns<{
      id: string; watcher: string; subject_key: string;
      level: string; last_announced_at: string | null; resolved_at: string | null;
    }[]>();

  const known = new Map((existing ?? []).map((r) => [`${r.watcher}:${r.subject_key}`, r]));
  const seen = new Set(findings.map((f) => `${f.watcher}:${f.key}`));
  const now = new Date().toISOString();

  // Anything previously open that no longer shows up has been dealt with.
  const fixed = (existing ?? []).filter(
    (r) => !r.resolved_at && !seen.has(`${r.watcher}:${r.subject_key}`),
  );
  if (fixed.length > 0) {
    await app.from("chitsano_alerts").update({ resolved_at: now }).in("id", fixed.map((r) => r.id));
  }

  const toAnnounce: Finding[] = [];
  for (const f of findings) {
    const prev = known.get(`${f.watcher}:${f.key}`);
    // A problem that came back after being fixed is news again.
    const prevOpen = prev && !prev.resolved_at ? prev : undefined;
    if (shouldAnnounce(f, prevOpen)) toAnnounce.push(f);
  }

  if (toAnnounce.length === 0) {
    // Still record what is open, so tomorrow's comparison is accurate.
    await upsertAll(app, findings, now, new Set());
    return NextResponse.json({ ok: true, posted: false, open: findings.length, resolved: fixed.length });
  }

  // One message, grouped by area and worst-first, so it reads like a person
  // reporting rather than a stack of separate alarms.
  const byWatcher = new Map<string, Finding[]>();
  for (const f of toAnnounce.sort((a, b) => ORDER[a.level] - ORDER[b.level])) {
    byWatcher.set(f.watcher, [...(byWatcher.get(f.watcher) ?? []), f]);
  }

  const lines: string[] = ["👀 Chitsano here — a few things worth a look:", ""];
  for (const [watcher, items] of byWatcher) {
    lines.push(`*${HEADING[watcher] ?? watcher}*`);
    for (const f of items.slice(0, 6)) lines.push(`${ICON[f.level]} ${f.summary}`);
    if (items.length > 6) lines.push(`   …and ${items.length - 6} more`);
    lines.push("");
  }
  lines.push("Tag @Chitsano if you want the detail on any of these.");

  await postToTeamGroup(lines.join("\n"), {
    pushTitle: "Chitsano AI",
    pushBody: `${toAnnounce.length} thing${toAnnounce.length === 1 ? "" : "s"} need attention`,
  });

  await upsertAll(app, findings, now, new Set(toAnnounce.map((f) => `${f.watcher}:${f.key}`)));

  return NextResponse.json({
    ok: true, posted: true, announced: toAnnounce.length,
    open: findings.length, resolved: fixed.length,
  });
}

/** Records every current finding; bumps the announce stamp only on those said. */
async function upsertAll(
  app: ReturnType<ReturnType<typeof createServiceClient>["schema"]>,
  findings: Finding[],
  now: string,
  announced: Set<string>,
) {
  if (findings.length === 0) return;
  await app.from("chitsano_alerts").upsert(
    findings.map((f) => {
      const said = announced.has(`${f.watcher}:${f.key}`);
      return {
        watcher: f.watcher,
        subject_key: f.key,
        level: f.level,
        summary: f.summary,
        resolved_at: null,          // it is current again
        ...(said ? { last_announced_at: now } : {}),
      };
    }),
    { onConflict: "watcher,subject_key" },
  );
}
