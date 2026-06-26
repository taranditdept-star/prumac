// Verifies the assignVehicle write path as a manager (RLS) — reassigns a held
// vehicle to another driver, then ROLLS BACK (no data changed).
// Run: node scripts/test-assign.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const mgr = (await c.query("select id from app.profiles where role='fleet_manager' limit 1")).rows[0];
  const va = (await c.query(
    `select va.vehicle_id, va.driver_id, pl.plate_number from app.vehicle_assignments va
     join app.vehicles pl on pl.id=va.vehicle_id where va.ended_at is null limit 1`,
  )).rows[0];
  const other = (await c.query(
    "select id from app.drivers where is_active and id <> $1 limit 1",
    [va.driver_id],
  )).rows[0];
  if (!mgr || !va || !other) throw new Error("missing manager/assignment/other driver");

  console.log(`Reassigning ${va.plate_number} to a different driver as manager ${mgr.id.slice(0, 8)} …`);
  await c.query("BEGIN");
  await c.query("SET LOCAL ROLE authenticated");
  await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: mgr.id, role: "authenticated" }),
  ]);
  // Replicate assignVehicle: end active on vehicle, end active on driver, insert.
  await c.query("UPDATE app.vehicle_assignments SET ended_at=now() WHERE vehicle_id=$1 AND ended_at IS NULL", [va.vehicle_id]);
  await c.query("UPDATE app.vehicle_assignments SET ended_at=now() WHERE driver_id=$1 AND ended_at IS NULL", [other.id]);
  await c.query(
    "INSERT INTO app.vehicle_assignments (vehicle_id, driver_id, assigned_by) VALUES ($1,$2,$3)",
    [va.vehicle_id, other.id, mgr.id],
  );
  await c.query("RESET ROLE");
  const now = (await c.query(
    "select driver_id from app.vehicle_assignments where vehicle_id=$1 and ended_at is null",
    [va.vehicle_id],
  )).rows;
  await c.query("ROLLBACK");
  const ok = now.length === 1 && now[0].driver_id === other.id;
  console.log(ok
    ? "✓ assignVehicle path works under RLS — vehicle reassigned with no constraint error (rolled back)."
    : `✗ Unexpected: ${JSON.stringify(now)}`);
} catch (e) {
  console.error("✗ assign test FAILED:", e.message);
  try { await c.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await c.end();
}
