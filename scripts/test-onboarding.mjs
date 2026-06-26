// Verifies a registering driver can complete onboarding via the RLS path
// (impersonates an IMPORT-PENDING driver, calls the RPC, checks the result,
// then ROLLS BACK — no data is changed). Run: node scripts/test-onboarding.mjs
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
  const pend = await c.query(
    `select d.profile_id, p.full_name from app.drivers d join app.profiles p on p.id=d.profile_id
     where d.is_active and d.licence_number='IMPORT-PENDING' order by p.full_name`,
  );
  console.log(`Drivers still needing onboarding (${pend.rowCount}):`);
  for (const r of pend.rows) console.log(`   • ${r.full_name}`);
  if (!pend.rowCount) {
    console.log("All drivers onboarded — nothing to test.");
  } else {
    const pid = pend.rows[0].profile_id;
    console.log(`\nSimulating onboarding for: ${pend.rows[0].full_name} (rolled back after)`);
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE authenticated");
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: pid, role: "authenticated" }),
    ]);
    await c.query(
      "SELECT app.fn_complete_driver_onboarding('+263770000000','HEALTHCHECK-LIC','2030-01-01')",
    );
    await c.query("RESET ROLE");
    const after = await c.query(
      `select d.licence_number, p.phone from app.drivers d join app.profiles p on p.id=d.profile_id where d.profile_id=$1`,
      [pid],
    );
    await c.query("ROLLBACK");
    const ok = after.rows[0].licence_number === "HEALTHCHECK-LIC" && after.rows[0].phone === "+263770000000";
    console.log(ok
      ? "✓ Onboarding RPC works — driver licence + phone updated correctly (then rolled back)."
      : `✗ Unexpected result: ${JSON.stringify(after.rows[0])}`);
  }
} catch (e) {
  console.error("✗ Onboarding test FAILED:", e.message);
  try { await c.query("ROLLBACK"); } catch {}
  process.exitCode = 1;
} finally {
  await c.end();
}
