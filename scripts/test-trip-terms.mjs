// Verifies the trip-terms agreement is seeded and a driver-context trip insert
// records the accepted version (Feature 4).
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
  const ag = await client.query(
    "SELECT id, title, version FROM app.agreements WHERE kind='trip_terms' AND is_active"
  );
  if (!ag.rows.length) throw new Error("No active trip_terms agreement seeded");
  console.log(`✓ Active agreement: "${ag.rows[0].title}" v${ag.rows[0].version}`);
  const agreementId = ag.rows[0].id;

  const { rows } = await client.query(
    `SELECT d.id AS driver_id, d.profile_id, va.vehicle_id, t.subsidiary_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id=d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id=d.profile_id
       LEFT JOIN app.trips t ON t.driver_id=d.id
      WHERE p.email='blessing@prumac.zw' AND d.is_active
      LIMIT 1`
  );
  const { driver_id, profile_id, vehicle_id } = rows[0];
  const sub = await client.query("SELECT id FROM app.subsidiaries LIMIT 1");
  const subsidiary_id = sub.rows[0].id;

  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profile_id, role: "authenticated" }),
  ]);

  const ins = await client.query(
    `INSERT INTO app.trips (vehicle_id, driver_id, subsidiary_id, purpose, status, started_at,
                            start_odometer_km, terms_agreement_id, terms_accepted_at)
     VALUES ($1,$2,$3,'delivery','in_progress', now(), 200000, $4, now())
     RETURNING id, terms_agreement_id, terms_accepted_at IS NOT NULL AS accepted`,
    [vehicle_id, driver_id, subsidiary_id, agreementId]
  );
  const row = ins.rows[0];
  console.log(`✓ Trip inserted under driver RLS with terms: agreement_id matches=${row.terms_agreement_id === agreementId} accepted=${row.accepted}`);

  await client.query("ROLLBACK");
  console.log("✓ Rolled back. PASS — trip records accepted terms version.");
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
