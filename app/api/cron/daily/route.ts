import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorizedCron } from "@/lib/cron/auth";

// Daily maintenance job (Vercel Cron). Runs every alert scan that used to be a
// manual "Scan" button, then flips past-due invoices to overdue. Idempotent —
// each scan RPC de-dupes its own alerts, so running it repeatedly is safe.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServiceClient();
  const results: Record<string, unknown> = {};

  // 1. Document expiries (+ reconciliation alerts, folded into the same RPC).
  {
    const { data, error } = await sb.schema("app").rpc("fn_scan_document_expiries");
    results.document_expiries = error ? { error: error.message } : data;
  }
  // 2. Service / PM due.
  {
    const { data, error } = await sb
      .schema("app")
      .rpc("fn_scan_service_due", { p_within_km: 500, p_within_days: 7 });
    results.service_due = error ? { error: error.message } : data;
  }
  // 3. Fuel-consumption anomalies.
  {
    const { data, error } = await sb
      .schema("app")
      .rpc("fn_scan_fuel_anomalies", { p_lookback_days: 60 });
    results.fuel_anomalies = error ? { error: error.message } : data;
  }
  // 4. Parts below reorder level.
  {
    const { data, error } = await sb.schema("app").rpc("fn_scan_part_stock");
    results.part_stock = error ? { error: error.message } : data;
  }

  // 5. Flip issued invoices to overdue once past their due date.
  const nowIso = new Date().toISOString();
  {
    const { data, error } = await sb
      .schema("app")
      .from("invoices")
      .update({ status: "overdue" })
      .eq("status", "issued")
      .lt("due_at", nowIso)
      .select("id");
    results.marked_overdue = error ? { error: error.message } : data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, ran_at: nowIso, results });
}
