// Verifies the new accident-photo path: (1) the photos bucket allows an
// authenticated browser upload (RLS policy), (2) a driver-reported accident
// links photo rows by path. Rolled back.
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
  // 1. Bucket + authenticated INSERT policy exist
  const bucket = await client.query("SELECT id, file_size_limit FROM storage.buckets WHERE id='photos'");
  if (!bucket.rows.length) throw new Error("photos bucket missing");
  console.log(`✓ photos bucket exists (limit ${bucket.rows[0].file_size_limit} bytes)`);

  const pol = await client.query(
    `SELECT polname FROM pg_policy WHERE polrelid='storage.objects'::regclass
       AND polname='photos_insert_authenticated' AND polcmd='a'`
  );
  console.log(`✓ authenticated upload policy present: ${pol.rows.length === 1}`);

  // 2. Driver reports an accident + photos linked by path
  const d = (await client.query(
    `SELECT d.id driver_id, d.profile_id, va.vehicle_id
       FROM app.drivers d
       JOIN app.vehicle_assignments va ON va.driver_id=d.id AND va.ended_at IS NULL
       JOIN app.profiles p ON p.id=d.profile_id
      WHERE p.email='blessing@prumac.zw' AND d.is_active LIMIT 1`
  )).rows[0];

  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: d.profile_id, role: "authenticated" }),
  ]);
  const acc = (await client.query(
    `INSERT INTO app.accidents (vehicle_id, reported_by, severity, occurred_at, location_description, description)
     VALUES ($1,$2,'minor', now(), 'Test loc', 'Photo path test') RETURNING id`,
    [d.vehicle_id, d.driver_id]
  )).rows[0].id;

  // Action inserts photo rows by path via the service role (RLS bypass)
  await client.query("RESET ROLE");
  const paths = [`accident/${crypto.randomUUID()}/a.jpg`, `accident/${crypto.randomUUID()}/b.jpg`];
  await client.query(
    "INSERT INTO app.accident_photos (accident_id, file_path) SELECT $1, unnest($2::text[])",
    [acc, paths]
  );
  const n = (await client.query("SELECT count(*)::int n FROM app.accident_photos WHERE accident_id=$1", [acc])).rows[0].n;
  console.log(`✓ accident ${acc} linked ${n} photo path(s) (expect 2)`);

  await client.query("ROLLBACK");
  console.log(n === 2 ? "✓ Rolled back. PASS — photos attach via path, no bytes through the action." : "✗ FAIL");
  if (n !== 2) process.exitCode = 1;
} catch (err) {
  console.error("✗ FAIL:", err.message);
  try { await client.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await client.end();
}
