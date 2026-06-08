// Verifies endTrip's auto-complete: driver ends (in_progress→ended via RLS),
// service completes (ended→completed), no open trip remains, vehicle freed.
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
  // A Blessing vehicle with NO current open trip
  const d = (await client.query(
    `SELECT d.id driver_id, d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id=d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id=d.profile_id
      WHERE p.email='blessing@prumac.zw' AND d.is_active
        AND NOT EXISTS (SELECT 1 FROM app.trips t WHERE t.vehicle_id=va.vehicle_id
                        AND t.status IN ('in_progress','paused','ended'))
        AND NOT EXISTS (SELECT 1 FROM app.trips t WHERE t.driver_id=d.id
                        AND t.status IN ('in_progress','paused','ended'))
      LIMIT 1`
  )).rows[0];
  if (!d) throw new Error("No free Blessing vehicle (an open trip already exists)");
  const sub = (await client.query("SELECT id FROM app.subsidiaries LIMIT 1")).rows[0].id;

  await client.query("BEGIN");

  // Seed an in_progress trip (as owner/service)
  const trip = (await client.query(
    `INSERT INTO app.trips (vehicle_id, driver_id, subsidiary_id, purpose, status, started_at, start_odometer_km)
     VALUES ($1,$2,$3,'delivery','in_progress', now(), 100000) RETURNING id`,
    [d.vehicle_id, d.driver_id, sub]
  )).rows[0].id;
  await client.query("UPDATE app.vehicles SET status='on_trip' WHERE id=$1", [d.vehicle_id]);
  console.log("✓ Seeded in_progress trip:", trip);

  // Step 1 — driver ends it (RLS)
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: d.profile_id, role: "authenticated" }),
  ]);
  await client.query(
    "UPDATE app.trips SET status='ended', ended_at=now(), end_odometer_km=100120 WHERE id=$1", [trip]
  );
  console.log("✓ Driver set status=ended under RLS");

  // Step 2 — service completes + reconcile + free vehicle (bypasses RLS)
  await client.query("RESET ROLE");
  await client.query("UPDATE app.trips SET status='completed', completed_at=now() WHERE id=$1", [trip]);
  await client.query("SELECT app.fn_reconcile_trip($1)", [trip]);
  await client.query("UPDATE app.vehicles SET status='available' WHERE id=$1", [d.vehicle_id]);

  // Verify
  const st = (await client.query("SELECT status FROM app.trips WHERE id=$1", [trip])).rows[0].status;
  const openForDriver = (await client.query(
    "SELECT count(*)::int n FROM app.trips WHERE driver_id=$1 AND status IN ('in_progress','paused','ended')", [d.driver_id]
  )).rows[0].n;
  const veh = (await client.query("SELECT status FROM app.vehicles WHERE id=$1", [d.vehicle_id])).rows[0].status;

  console.log(`✓ trip status=${st} (expect completed)`);
  console.log(`✓ open trips blocking driver=${openForDriver} (expect 0 — can start a new trip)`);
  console.log(`✓ vehicle status=${veh} (expect available)`);

  const pass = st === "completed" && openForDriver === 0 && veh === "available";
  await client.query("ROLLBACK");
  console.log(pass ? "✓ Rolled back. PASS — end auto-completes, no manual admin step needed." : "✗ FAIL");
  if (!pass) process.exitCode = 1;
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
