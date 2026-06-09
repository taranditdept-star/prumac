// Verifies the DB-side of the cron + billing + onboarding + settings batch.
// Safe to run repeatedly: the scan RPCs de-dupe their own alerts.
// Usage: node scripts/test-batch-features.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log("— Cron daily: alert scans —");
  const docs = await client.query("SELECT app.fn_scan_document_expiries() AS n");
  console.log(`✓ fn_scan_document_expiries → ${docs.rows[0].n}`);
  const svc = await client.query("SELECT app.fn_scan_service_due(500, 7) AS n");
  console.log(`✓ fn_scan_service_due → ${svc.rows[0].n}`);
  const fuel = await client.query("SELECT app.fn_scan_fuel_anomalies(60) AS n");
  console.log(`✓ fn_scan_fuel_anomalies → ${fuel.rows[0].n}`);
  const parts = await client.query("SELECT app.fn_scan_part_stock() AS n");
  console.log(`✓ fn_scan_part_stock → ${parts.rows[0].n}`);

  console.log("\n— Cron daily: overdue flip —");
  const overdue = await client.query(
    "SELECT count(*)::int AS n FROM app.invoices WHERE status = 'issued' AND due_at < now()",
  );
  console.log(`✓ invoices that would flip issued→overdue today: ${overdue.rows[0].n}`);

  console.log("\n— Cron monthly: invoice generation —");
  const genFn = await client.query(
    "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='fn_generate_invoice'",
  );
  console.log(genFn.rowCount ? "✓ fn_generate_invoice present" : "✗ fn_generate_invoice MISSING");

  console.log("\n— Billing: per_load uses load_count —");
  const col = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='trips' AND column_name='load_count'",
  );
  console.log(col.rowCount ? "✓ trips.load_count column exists" : "✗ trips.load_count MISSING");
  const src = await client.query(
    "SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='fn_trip_charge'",
  );
  console.log(
    src.rows[0].def.includes("load_count")
      ? "✓ fn_trip_charge now reads load_count for per_load"
      : "✗ fn_trip_charge does NOT reference load_count",
  );

  console.log("\n— Driver onboarding —");
  const onbFn = await client.query(
    "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='fn_complete_driver_onboarding'",
  );
  console.log(onbFn.rowCount ? "✓ fn_complete_driver_onboarding present" : "✗ MISSING");
  const pending = await client.query(
    "SELECT count(*)::int AS n FROM app.drivers WHERE licence_number = 'IMPORT-PENDING'",
  );
  console.log(`✓ drivers needing onboarding (licence='IMPORT-PENDING'): ${pending.rows[0].n}`);

  console.log("\n— Settings —");
  const setting = await client.query(
    "SELECT value FROM app.app_settings WHERE key='odometer_jump_threshold_km'",
  );
  console.log(
    setting.rowCount
      ? `✓ app_settings seeded: odometer_jump_threshold_km = ${JSON.stringify(setting.rows[0].value)}`
      : "✗ app_settings row MISSING",
  );

  console.log("\nAll batch-feature DB checks ran.");
}

main()
  .catch((e) => {
    console.error("✗", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
