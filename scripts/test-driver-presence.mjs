// Verifies the driver-presence layer (migration 0041):
//  1. A driver can upsert their own live position via fn_record_driver_location
//     (under authenticated RLS), and it resolves their vehicle/trip.
//  2. A second call upserts the SAME row (one row per driver, no growth).
//  3. A manager/admin can read it via fn_live_driver_positions.
//  4. A driver is NOT allowed to call fn_live_driver_positions (manager only).
// All wrapped in a transaction and ROLLED BACK — no live data is mutated.
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

async function asUser(profileId) {
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profileId, role: "authenticated" }),
  ]);
}

try {
  // A real driver + the admin profile.
  const d = await client.query(
    `SELECT d.id AS driver_id, d.profile_id, p.full_name
       FROM app.drivers d JOIN app.profiles p ON p.id = d.profile_id
      WHERE p.email = 'blessing@prumac.zw' AND d.is_active LIMIT 1`,
  );
  const driver = d.rows[0];
  const a = await client.query(
    "SELECT id FROM app.profiles WHERE email = 'admin@prumac.zw' LIMIT 1",
  );
  const adminId = a.rows[0].id;
  console.log(`Driver: ${driver.full_name} (${driver.driver_id})`);

  await client.query("BEGIN");

  // --- 1 & 2: driver upserts position twice -------------------------------
  await asUser(driver.profile_id);
  // Bulawayo → Kwekwe corridor coords (the user's test route).
  await client.query(
    "SELECT app.fn_record_driver_location($1,$2,$3,$4,$5,$6)",
    [-19.45, 29.81, 87.5, 90, 8.0, 76],
  );
  await client.query(
    "SELECT app.fn_record_driver_location($1,$2,$3,$4,$5,$6)",
    [-19.0, 29.95, 64.0, 88, 6.0, 75],
  );
  await client.query("RESET ROLE");

  const cnt = await client.query(
    "SELECT count(*)::int n FROM app.driver_presence WHERE driver_id = $1",
    [driver.driver_id],
  );
  console.log(`✓ Upserted twice → ${cnt.rows[0].n} row(s) (expect 1 — one row per driver)`);
  if (cnt.rows[0].n !== 1) throw new Error("Expected exactly one presence row");

  const row = await client.query(
    `SELECT ST_Y(point::geometry) lat, ST_X(point::geometry) lng, speed_kph, battery_pct, vehicle_id
       FROM app.driver_presence WHERE driver_id = $1`,
    [driver.driver_id],
  );
  const r = row.rows[0];
  console.log(
    `✓ Latest fix lat=${(+r.lat).toFixed(3)} lng=${(+r.lng).toFixed(3)} speed=${r.speed_kph} battery=${r.battery_pct}% vehicle=${r.vehicle_id ?? "none"}`,
  );

  // --- 3: manager reads live positions ------------------------------------
  await asUser(adminId);
  const live = await client.query("SELECT * FROM app.fn_live_driver_positions(900)");
  await client.query("RESET ROLE");
  const mine = live.rows.find((x) => x.driver_id === driver.driver_id);
  console.log(`✓ Admin sees ${live.rows.length} live driver(s); our driver present: ${!!mine}`);
  if (!mine) throw new Error("Driver missing from fn_live_driver_positions");
  console.log(
    `   → ${mine.driver_name}: ${Math.round(mine.lat * 1000) / 1000},${Math.round(mine.lng * 1000) / 1000} @ ${mine.speed_kph}km/h, trip=${mine.trip_id ?? "none"}, ${mine.seconds_old}s old`,
  );

  // --- 4: a driver must NOT be able to read everyone's positions ----------
  await client.query("SAVEPOINT sp");
  await asUser(driver.profile_id);
  let blocked = false;
  try {
    await client.query("SELECT * FROM app.fn_live_driver_positions(900)");
  } catch (e) {
    blocked = e.code === "42501"; // insufficient_privilege
  }
  await client.query("ROLLBACK TO SAVEPOINT sp");
  await client.query("RESET ROLE");
  console.log(`✓ Driver blocked from fn_live_driver_positions: ${blocked} (expect true)`);
  if (!blocked) throw new Error("Driver was able to read all positions — RLS hole");

  await client.query("ROLLBACK");
  console.log("\n✓ PASS — presence upsert, manager read, and driver-block all work. (rolled back)");
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
