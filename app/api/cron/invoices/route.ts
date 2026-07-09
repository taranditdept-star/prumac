import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { sendMonthlyReport } from "@/lib/ops/monthly-report";

// Monthly billing job (Vercel Cron, 1st of the month). Generates a DRAFT
// invoice per subsidiary for the prior calendar month — only where there were
// completed trips. Drafts are NOT issued: a human still reviews and issues them
// (billing rules for tankers/grabber are still being finalised), so this never
// bills a subsidiary automatically. fn_generate_invoice is draft-idempotent.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();

  // Prior calendar month, [start, end) — both as YYYY-MM-DD.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  const { data: subs, error: subErr } = await sb
    .schema("app")
    .from("subsidiaries")
    .select("id, name")
    .returns<{ id: string; name: string }[]>();
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  const generated: { subsidiary: string; invoice_id: string | null; note?: string }[] = [];

  for (const s of subs ?? []) {
    // Skip subsidiaries with no completed trips in the period (avoids empty drafts).
    const { count } = await sb
      .schema("app")
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("subsidiary_id", s.id)
      .eq("status", "completed")
      .gte("completed_at", startStr)
      .lt("completed_at", endStr);

    if (!count) {
      generated.push({ subsidiary: s.name, invoice_id: null, note: "no completed trips" });
      continue;
    }

    const { data, error } = await sb.schema("app").rpc("fn_generate_invoice", {
      p_subsidiary_id: s.id,
      p_period_start: startStr,
      p_period_end: endStr,
      p_actor_id: null,
    });
    generated.push({
      subsidiary: s.name,
      invoice_id: error ? null : (data as string),
      note: error?.message,
    });
  }

  // Email the monthly summary to managers (no-op without SMTP).
  const report = await sendMonthlyReport({ periodStart: startStr, periodEnd: endStr });

  return NextResponse.json({ ok: true, period: { start: startStr, end: endStr }, generated, report });
}
