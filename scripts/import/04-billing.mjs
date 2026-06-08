// #4 — make the financial pages reflect the imported year:
//  A) backdate each vehicle's billing rate to cover the import period
//     (rates only existed from Feb 2026, so older trips charged $0)
//  B) generate a calendar-month draft invoice per subsidiary that has trips
//     (Reports/Billing read invoice_line_items, so this lights them up)
import { pgClient } from "./lib.mjs";

const PERIOD_START = "2025-07-01";

const c = await pgClient();
try {
  const admin = (await c.query("SELECT id FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0].id;

  // ── A) backdate rates ──────────────────────────────────────────────────────
  // For each currently-open rate that starts after the import period, clone it
  // back to PERIOD_START so historical trips get the same charge/km.
  const openRates = (await c.query(
    `SELECT id, vehicle_id, subsidiary_id, mode, rate_amount, currency, radius_km, effective_from
       FROM app.billing_rates
      WHERE effective_until IS NULL AND effective_from > $1`, [PERIOD_START])).rows;
  let backfilled = 0;
  for (const r of openRates) {
    const covered = (await c.query(
      `SELECT 1 FROM app.billing_rates
        WHERE vehicle_id=$1 AND mode=$2 AND effective_from <= $3 LIMIT 1`,
      [r.vehicle_id, r.mode, PERIOD_START])).rows.length > 0;
    if (covered) continue;
    await c.query(
      `INSERT INTO app.billing_rates
         (vehicle_id, subsidiary_id, mode, rate_amount, currency, radius_km,
          effective_from, effective_until, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Backfilled from Excel import',$9)`,
      [r.vehicle_id, r.subsidiary_id, r.mode, r.rate_amount, r.currency, r.radius_km,
       PERIOD_START, r.effective_from, admin]);
    backfilled++;
  }

  // ── B) generate invoices ───────────────────────────────────────────────────
  // Every (subsidiary, calendar-month) that has at least one completed trip.
  const combos = (await c.query(
    `SELECT subsidiary_id, to_char(date_trunc('month', completed_at), 'YYYY-MM-DD') AS month_start
       FROM app.trips
      WHERE status='completed' AND completed_at >= $1 AND completed_at < '2026-07-01'
      GROUP BY 1, 2 ORDER BY 2, 1`, [PERIOD_START])).rows;

  let generated = 0, skipped = 0;
  for (const { subsidiary_id, month_start } of combos) {
    const d = new Date(month_start + "T00:00:00Z");
    const endD = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const period_end = endD.toISOString().slice(0, 10);

    // skip if an invoice already exists for this exact subsidiary+period
    const exists = (await c.query(
      "SELECT 1 FROM app.invoices WHERE subsidiary_id=$1 AND period_start=$2 AND period_end=$3 AND status<>'draft' LIMIT 1",
      [subsidiary_id, month_start, period_end])).rows.length > 0;
    if (exists) { skipped++; continue; }

    await c.query("SELECT app.fn_generate_invoice($1,$2,$3,$4)", [subsidiary_id, month_start, period_end, admin]);
    generated++;
  }

  // ── report ─────────────────────────────────────────────────────────────────
  const inv = (await c.query("SELECT count(*)::int n, round(sum(total_due))::int total FROM app.invoices")).rows[0];
  const rev = (await c.query(
    `SELECT round(sum(li.quantity*li.unit_amount))::int revenue, count(*)::int lines
       FROM app.invoice_line_items li WHERE li.line_type='trip'`)).rows[0];
  console.log(`Rates backfilled to ${PERIOD_START}: ${backfilled}`);
  console.log(`Invoices generated:                  ${generated} (skipped ${skipped} existing)`);
  console.log(`Invoices total now:                  ${inv.n}  ($${inv.total} total due)`);
  console.log(`Trip line-items:                     ${rev.lines}  ($${rev.revenue} charged)`);
} finally {
  await c.end();
}
