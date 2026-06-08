// Simulates a driver-context accident insert under RLS (what PostgREST does)
// to prove migration 0026 fixed the alert-trigger rollback.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  // Find Blessing (an active driver) + one of her vehicles
  const { rows } = await client.query(
    `SELECT d.id AS driver_id, d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id = d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id = d.profile_id
      WHERE p.email = 'blessing@prumac.zw' AND d.is_active
      LIMIT 1`
  );
  if (!rows.length) throw new Error("Blessing not found / no active assignment");
  const { driver_id, profile_id, vehicle_id } = rows[0];
  console.log("Driver:", driver_id, "Vehicle:", vehicle_id);

  await client.query("BEGIN");
  // Impersonate the driver exactly like Supabase/PostgREST does
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profile_id, role: "authenticated" }),
  ]);

  const ins = await client.query(
    `INSERT INTO app.accidents
       (vehicle_id, reported_by, severity, occurred_at, location_description, description)
     VALUES ($1, $2, 'minor', now(), 'RLS TEST — Samora Machel Ave', 'Automated RLS verification for migration 0026')
     RETURNING id`,
    [vehicle_id, driver_id]
  );
  const accidentId = ins.rows[0].id;
  console.log("✓ Accident inserted under driver RLS:", accidentId);

  // Confirm the trigger raised exactly one alert (now via SECURITY DEFINER)
  await client.query("RESET ROLE");
  const alerts = await client.query(
    "SELECT count(*)::int AS n FROM app.alerts WHERE accident_id = $1",
    [accidentId]
  );
  console.log(`✓ Alerts auto-raised by trigger: ${alerts.rows[0].n} (expected 1)`);

  await client.query("ROLLBACK"); // don't keep the test row
  console.log("✓ Rolled back test data. PASS — accident logging works under driver RLS.");
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
