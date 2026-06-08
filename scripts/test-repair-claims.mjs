// Verifies the repair-claim flow: driver submits under RLS, admin approves via
// fn_approve_repair_claim which creates a reimbursable service_record (Feature 5).
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
  const d = await client.query(
    `SELECT d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id=d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id=d.profile_id
      WHERE p.email='blessing@prumac.zw' AND d.is_active LIMIT 1`
  );
  const { profile_id: driverPid, vehicle_id } = d.rows[0];
  const adminPid = (await client.query("SELECT id FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0].id;
  const subId = (await client.query("SELECT id FROM app.subsidiaries LIMIT 1")).rows[0].id;

  await client.query("BEGIN");

  // 1. Driver submits the claim under their RLS
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: driverPid, role: "authenticated" }),
  ]);
  const ins = await client.query(
    `INSERT INTO app.repair_claims (vehicle_id, submitted_by, subsidiary_id, description, amount, currency, odometer_km)
     VALUES ($1,$2,$3,'Replaced front brake pads',85.50,'USD',201000) RETURNING id, status`,
    [vehicle_id, driverPid, subId]
  );
  const claimId = ins.rows[0].id;
  console.log(`✓ Driver submitted claim ${claimId} status=${ins.rows[0].status}`);

  // A driver must NOT be able to approve (insufficient_privilege).
  // Use a savepoint so the expected error doesn't poison the outer transaction.
  let blocked = false;
  await client.query("SAVEPOINT sp_block");
  try {
    await client.query("SELECT app.fn_approve_repair_claim($1,$2,null)", [claimId, subId]);
  } catch (e) {
    blocked = e.code === "42501";
    await client.query("ROLLBACK TO SAVEPOINT sp_block");
  }
  console.log(`✓ Driver blocked from approving: ${blocked}`);

  // 2. Admin approves
  await client.query("RESET ROLE");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: adminPid, role: "authenticated" }),
  ]);
  const appr = await client.query("SELECT app.fn_approve_repair_claim($1,$2,$3) AS sr_id", [
    claimId, subId, "Approved — looks legitimate",
  ]);
  const srId = appr.rows[0].sr_id;

  await client.query("RESET ROLE");
  const chk = await client.query(
    `SELECT rc.status, rc.service_record_id, sr.total_amount, sr.reimburse_from_subsidiary_id, sr.is_routine_service
       FROM app.repair_claims rc JOIN app.service_records sr ON sr.id=rc.service_record_id
      WHERE rc.id=$1`, [claimId]
  );
  const r = chk.rows[0];
  console.log(`✓ Approved: status=${r.status} sr_amount=${r.total_amount} reimburse_sub=${r.reimburse_from_subsidiary_id === subId} routine=${r.is_routine_service} sr_linked=${r.service_record_id === srId}`);

  await client.query("ROLLBACK");
  console.log("✓ Rolled back. PASS — repair claim flows into a reimbursable service record.");
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
