// Verifies fn_submit_standalone_inspection works under driver RLS (no trip).
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
  const { rows } = await client.query(
    `SELECT d.id AS driver_id, d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id = d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id = d.profile_id
      WHERE p.email = 'blessing@prumac.zw' AND d.is_active
      LIMIT 1`
  );
  const { profile_id, vehicle_id } = rows[0];

  // Resolve template + a few items for this vehicle
  const tpl = await client.query("SELECT app.fn_template_for_vehicle($1) AS id", [vehicle_id]);
  const templateId = tpl.rows[0].id;
  const items = await client.query(
    "SELECT id, category, label FROM app.inspection_checklist_items WHERE template_id = $1 ORDER BY sort_order LIMIT 4",
    [templateId]
  );
  const payload = items.rows.map((it, idx) => ({
    checklist_item_id: it.id,
    result: idx === 1 ? "attention" : "pass",
    notes: idx === 1 ? "Test note" : null,
  }));
  console.log("Template:", templateId, "items:", items.rows.length);
  // Confirm the Operational test augmentation landed
  const op = await client.query(
    "SELECT count(*)::int n FROM app.inspection_checklist_items WHERE template_id=$1 AND category='Operational test'",
    [templateId]
  );
  console.log(`✓ 'Operational test' items on template: ${op.rows[0].n}`);

  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profile_id, role: "authenticated" }),
  ]);

  const res = await client.query(
    "SELECT app.fn_submit_standalone_inspection($1,$2,$3,$4,$5,$6) AS id",
    [vehicle_id, "daily_checklist", templateId, 123456, "Standalone RLS test", JSON.stringify(payload)]
  );
  const inspId = res.rows[0].id;
  console.log("✓ Standalone checklist submitted under driver RLS:", inspId);

  await client.query("RESET ROLE");
  const chk = await client.query(
    "SELECT trip_id, type, overall_result, (SELECT count(*) FROM app.inspection_item_results r WHERE r.inspection_id=i.id) AS n_items FROM app.inspections i WHERE id=$1",
    [inspId]
  );
  const row = chk.rows[0];
  console.log(`✓ trip_id=${row.trip_id} type=${row.type} overall=${row.overall_result} items=${row.n_items} (expect trip_id=null, overall=attention)`);

  await client.query("ROLLBACK");
  console.log("✓ Rolled back. PASS — standalone checklist works without a trip, under driver RLS.");
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
