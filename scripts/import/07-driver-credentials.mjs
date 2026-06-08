// Provision username + password login for every driver.
//  - username = generated ID "PMD001"… (stored in drivers.employee_number)
//  - auth email = <username>@drivers.prumac.local (synthetic; drivers never see it)
//  - a random password is set via the Supabase admin API (proper hashing)
// Idempotent: drivers already provisioned (synthetic email + PMD id) are skipped
// so re-runs don't reset existing passwords. Outputs driver-credentials.csv.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const DOMAIN = "drivers.prumac.local";
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz"; // no 0/O/1/l/I
function genPassword(n = 9) {
  let s = "";
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

try {
  const drivers = (await c.query(
    `SELECT d.id, d.profile_id, d.employee_number, p.full_name, u.email AS auth_email
       FROM app.drivers d
       JOIN app.profiles p ON p.id = d.profile_id
       JOIN auth.users u ON u.id = d.profile_id
      WHERE p.role = 'driver'
      ORDER BY p.full_name`)).rows;

  let maxNum = 0;
  for (const d of drivers) {
    const m = (d.employee_number || "").match(/^PMD(\d+)$/);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }

  const provisioned = [];
  let skipped = 0;
  for (const d of drivers) {
    const hasId = /^PMD\d+$/.test(d.employee_number || "");
    const synthetic = (d.auth_email || "").endsWith(`@${DOMAIN}`);
    if (hasId && synthetic) { skipped++; continue; } // already provisioned

    const username = hasId ? d.employee_number : `PMD${String(++maxNum).padStart(3, "0")}`;
    const email = `${username.toLowerCase()}@${DOMAIN}`;
    const password = genPassword();

    const { error } = await sb.auth.admin.updateUserById(d.profile_id, {
      email,
      password,
      email_confirm: true,
    });
    if (error) { console.log(`  ✗ ${d.full_name}: ${error.message}`); continue; }

    await c.query("UPDATE app.drivers SET employee_number=$1 WHERE id=$2", [username, d.id]);
    provisioned.push({ name: d.full_name, username, password });
  }

  if (provisioned.length) {
    const csv = "Name,Username,Password\n" +
      provisioned.map((p) => `"${p.name}",${p.username},${p.password}`).join("\n") + "\n";
    writeFileSync(resolve(root, "driver-credentials.csv"), csv);
  }

  console.log(`Provisioned ${provisioned.length} drivers (skipped ${skipped} already set).`);
  if (provisioned.length) {
    console.log("Credentials written to driver-credentials.csv. Sample:");
    console.table(provisioned.slice(0, 6));
  }
} finally {
  await c.end();
}
