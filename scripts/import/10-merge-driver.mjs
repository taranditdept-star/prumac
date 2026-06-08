// Consolidate duplicate driver records (e.g. the 3 "Fredmore Marema" rows).
// Re-points ALL foreign-key references onto the kept record, then removes the
// duplicates (delete the auth user → cascades profile → driver).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const NAME = process.argv[2] || "FREDMORE MAREMA";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

try {
  const dups = (await c.query(
    `SELECT d.id, d.profile_id, d.employee_number
       FROM app.drivers d JOIN app.profiles p ON p.id=d.profile_id
      WHERE upper(p.full_name)=upper($1) ORDER BY d.employee_number`, [NAME])).rows;
  if (dups.length < 2) { console.log(`Only ${dups.length} record for "${NAME}" — nothing to merge.`); process.exit(0); }

  const keep = dups[0];
  const remove = dups.slice(1);
  console.log(`Keeping ${keep.employee_number} (${keep.id.slice(0, 8)}); merging ${remove.map((r) => r.employee_number).join(", ")}`);

  // Every column that references app.drivers(id)
  const fks = (await c.query(`
    SELECT (c.conrelid::regclass)::text tbl, a.attname col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
     WHERE c.confrelid='app.drivers'::regclass AND c.contype='f'`)).rows;

  for (const r of remove) {
    for (const fk of fks) {
      try {
        const res = await c.query(`UPDATE ${fk.tbl} SET ${fk.col}=$1 WHERE ${fk.col}=$2`, [keep.id, r.id]);
        if (res.rowCount) console.log(`  ${fk.tbl}.${fk.col}: re-pointed ${res.rowCount}`);
      } catch (e) {
        // unique/exclusion clash → the duplicate's row is redundant; drop it
        console.log(`  ${fk.tbl}.${fk.col}: clash (${e.code}) — deleting duplicate rows`);
        await c.query(`DELETE FROM ${fk.tbl} WHERE ${fk.col}=$1`, [r.id]).catch(() => {});
      }
    }
    // remove the duplicate identity (auth user → profile → driver cascade)
    const { error } = await sb.auth.admin.deleteUser(r.profile_id);
    if (error) console.log(`  ✗ delete ${r.employee_number}: ${error.message}`);
    else console.log(`  ✓ removed ${r.employee_number}`);
  }

  const remaining = (await c.query(
    `SELECT count(*)::int n FROM app.drivers d JOIN app.profiles p ON p.id=d.profile_id WHERE upper(p.full_name)=upper($1)`, [NAME])).rows[0].n;
  const trips = (await c.query("SELECT count(*)::int n FROM app.trips WHERE driver_id=$1", [keep.id])).rows[0].n;
  console.log(`\n"${NAME}" records now: ${remaining}; kept driver has ${trips} trips.`);
} finally {
  await c.end();
}
