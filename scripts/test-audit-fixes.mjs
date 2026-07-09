// Verifies the critical audit fixes on the live schema, all ROLLED BACK:
//  1. fn_end_trip completes a trip + frees the vehicle atomically (unstuck).
//  2. fn_submit_inspection blocks a non-owner driver (IDOR fix).
//  3. invoices CHECK now permits a net-credit invoice (negative total_due).
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
const asDriver = async (pid) => {
  await c.query("SET LOCAL ROLE authenticated");
  await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: pid, role: "authenticated" })]);
};

try {
  const seat = (await c.query(
    `select va.driver_id, d.profile_id, va.vehicle_id, v.current_odometer_km odo, v.default_subsidiary_id sub
       from app.vehicle_assignments va join app.drivers d on d.id=va.driver_id join app.vehicles v on v.id=va.vehicle_id
      where va.ended_at is null limit 1`,
  )).rows[0];
  const other = (await c.query("select profile_id from app.drivers where is_active and id<>$1 limit 1", [seat.driver_id])).rows[0];

  // ── 1. fn_end_trip ──
  await c.query("BEGIN");
  const trip = (await c.query(
    `insert into app.trips (vehicle_id, driver_id, subsidiary_id, purpose, start_odometer_km, status, started_at, created_by)
     values ($1,$2,$3,'delivery',$4,'in_progress',now(),$5) returning id`,
    [seat.vehicle_id, seat.driver_id, seat.sub, seat.odo, seat.profile_id],
  )).rows[0].id;
  await asDriver(seat.profile_id);
  await c.query("SELECT app.fn_end_trip($1,$2,null,null,null)", [trip, seat.odo + 120]);
  await c.query("RESET ROLE");
  const ts = (await c.query("select status from app.trips where id=$1", [trip])).rows[0].status;
  const vs = (await c.query("select status from app.vehicles where id=$1", [seat.vehicle_id])).rows[0].status;
  console.log(`1) fn_end_trip → trip=${ts} vehicle=${vs} ${ts === "completed" && vs === "available" ? "✓" : "✗"}`);
  await c.query("ROLLBACK");

  // ── 2. fn_submit_inspection ownership guard ──
  await c.query("BEGIN");
  const trip2 = (await c.query(
    `insert into app.trips (vehicle_id, driver_id, subsidiary_id, purpose, start_odometer_km, status, started_at, created_by)
     values ($1,$2,$3,'delivery',$4,'in_progress',now(),$5) returning id`,
    [seat.vehicle_id, seat.driver_id, seat.sub, seat.odo, seat.profile_id],
  )).rows[0].id;
  const tmpl = (await c.query("select app.fn_template_for_vehicle($1) id", [seat.vehicle_id])).rows[0].id;
  let blocked = false;
  await c.query("SAVEPOINT sp");
  try {
    await asDriver(other.profile_id); // a DIFFERENT driver
    await c.query("SELECT app.fn_submit_inspection($1,'pre_trip'::app.inspection_type,$2,$3,'x','[]'::jsonb)", [trip2, tmpl, seat.odo]);
  } catch (e) {
    blocked = e.code === "42501" || /not allowed/i.test(e.message);
    await c.query("ROLLBACK TO SAVEPOINT sp");
  }
  await c.query("RESET ROLE");
  console.log(`2) non-owner inspection blocked → ${blocked ? "✓" : "✗ (SECURITY: not blocked!)"}`);
  await c.query("ROLLBACK");

  // ── 3. net-credit invoice allowed ──
  await c.query("BEGIN");
  let creditOk = false;
  try {
    await c.query(
      `insert into app.invoices (invoice_number, subsidiary_id, period_start, period_end, status, currency, subtotal, maintenance_credit, previous_balance, total_due)
       values ('TEST-CREDIT-'||floor(random()*100000)::text, $1, '2026-01-01','2026-02-01','draft','USD',0,50,0,-50)`,
      [seat.sub],
    );
    creditOk = true;
  } catch (e) {
    creditOk = false;
    console.log("   credit insert error:", e.message);
  }
  console.log(`3) net-credit invoice (total_due=-50) allowed → ${creditOk ? "✓" : "✗"}`);
  await c.query("ROLLBACK");

  console.log("\nAudit-fix verification done (all rolled back).");
} catch (e) {
  console.error("✗", e.message);
  try { await c.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await c.end();
}
