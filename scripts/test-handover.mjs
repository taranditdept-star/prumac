// Verifies the full handover flow under driver RLS: from-driver initiates,
// to-driver confirms, vehicle is atomically reassigned, two inspections created.
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

async function asDriver(pid) {
  await client.query("RESET ROLE");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: pid, role: "authenticated" }),
  ]);
}

try {
  // From-driver = Blessing + one of her vehicles
  const from = (await client.query(
    `SELECT d.id driver_id, d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id=d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id=d.profile_id
      WHERE p.email='blessing@prumac.zw' AND d.is_active LIMIT 1`
  )).rows[0];
  // To-driver = any other active driver
  const to = (await client.query(
    `SELECT d.id driver_id, d.profile_id
       FROM app.drivers d JOIN app.profiles p ON p.id=d.profile_id
      WHERE d.is_active AND d.id <> $1 LIMIT 1`, [from.driver_id]
  )).rows[0];

  const templateId = (await client.query("SELECT app.fn_template_for_vehicle($1) id", [from.vehicle_id])).rows[0].id;
  const items = (await client.query(
    "SELECT id FROM app.inspection_checklist_items WHERE template_id=$1 ORDER BY sort_order LIMIT 3", [templateId]
  )).rows.map((r) => ({ checklist_item_id: r.id, result: "pass" }));

  await client.query("BEGIN");

  // 1. From-driver initiates
  await asDriver(from.profile_id);
  const hid = (await client.query(
    "SELECT app.fn_initiate_handover($1,$2,$3,$4,$5,$6,$7) id",
    [from.vehicle_id, to.driver_id, templateId, 205000, "Tank full", JSON.stringify(items), "Please confirm by noon"]
  )).rows[0].id;
  console.log("✓ Handover initiated:", hid);

  // 2. To-driver confirms takeover
  await asDriver(to.profile_id);
  await client.query(
    "SELECT app.fn_confirm_takeover($1,$2,$3,$4,$5)",
    [hid, templateId, 205000, "Looks good", JSON.stringify(items)]
  );
  console.log("✓ Takeover confirmed by receiving driver");

  // 3. Verify outcome
  await client.query("RESET ROLE");
  const h = (await client.query(
    `SELECT status, from_inspection_id IS NOT NULL fi, to_inspection_id IS NOT NULL ti FROM app.vehicle_handovers WHERE id=$1`, [hid]
  )).rows[0];
  const insTypes = (await client.query(
    `SELECT type::text FROM app.inspections WHERE id IN (
        SELECT from_inspection_id FROM app.vehicle_handovers WHERE id=$1
        UNION SELECT to_inspection_id FROM app.vehicle_handovers WHERE id=$1) ORDER BY type`, [hid]
  )).rows.map((r) => r.type);
  const fromOpen = (await client.query(
    "SELECT count(*)::int n FROM app.vehicle_assignments WHERE vehicle_id=$1 AND driver_id=$2 AND ended_at IS NULL",
    [from.vehicle_id, from.driver_id]
  )).rows[0].n;
  const toOpen = (await client.query(
    "SELECT count(*)::int n FROM app.vehicle_assignments WHERE vehicle_id=$1 AND driver_id=$2 AND ended_at IS NULL",
    [from.vehicle_id, to.driver_id]
  )).rows[0].n;

  console.log(`✓ status=${h.status} from_insp=${h.fi} to_insp=${h.ti} types=[${insTypes}]`);
  console.log(`✓ reassignment: from-driver open assignments=${fromOpen} (expect 0), to-driver open=${toOpen} (expect 1)`);

  const pass = h.status === "accepted" && h.fi && h.ti && fromOpen === 0 && toOpen === 1
    && insTypes.includes("handover") && insTypes.includes("takeover");
  await client.query("ROLLBACK");
  console.log(pass ? "✓ Rolled back. PASS — handover end-to-end correct." : "✗ FAIL — outcome mismatch");
  if (!pass) process.exitCode = 1;
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
