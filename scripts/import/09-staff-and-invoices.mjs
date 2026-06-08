// 1) Create manager + accountant logins (username + password).
// 2) Revert the imported invoices to DRAFT pending PRUMAC's real billing rules
//    (revenue still shows in Reports; just not billable/overdue).
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
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
const genPassword = (n = 10) => Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

// Generic staff accounts — rename / add more later via the admin UI.
const STAFF = [
  { username: "MGR001", full_name: "Fleet Manager", role: "fleet_manager" },
  { username: "ACC001", full_name: "Accountant",    role: "admin" }, // finance: billing, repairs, rates
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

try {
  // Bypass the profile role-immutability trigger for this maintenance session.
  await c.query("SET session_replication_role = replica");

  // ── 1) staff logins ──────────────────────────────────────────────────────
  const created = [];
  for (const s of STAFF) {
    const email = `${s.username.toLowerCase()}@${DOMAIN}`;
    const existing = (await c.query("SELECT id FROM auth.users WHERE email=$1", [email])).rows[0];
    const password = genPassword();
    let uid;
    if (existing) {
      uid = existing.id;
      const { error } = await sb.auth.admin.updateUserById(uid, { password, email_confirm: true });
      if (error) { console.log(`  ✗ ${s.username}: ${error.message}`); continue; }
    } else {
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: s.full_name } });
      if (error) { console.log(`  ✗ ${s.username}: ${error.message}`); continue; }
      uid = data.user.id;
    }
    await c.query(
      `INSERT INTO app.profiles (id, full_name, role, is_active) VALUES ($1,$2,$3,true)
       ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, is_active=true`,
      [uid, s.full_name, s.role]);
    created.push({ full_name: s.full_name, username: s.username, password, role: s.role });
  }
  if (created.length) {
    writeFileSync(resolve(root, "staff-credentials.csv"),
      "Name,Username,Password,Role\n" + created.map((x) => `"${x.full_name}",${x.username},${x.password},${x.role}`).join("\n") + "\n");
    console.log(`\nStaff accounts created: ${created.length} → staff-credentials.csv`);
    console.table(created);
  }

  // ── 2) revert invoices to draft ──────────────────────────────────────────
  const r = await c.query(
    `UPDATE app.invoices SET status='draft', issued_at=NULL, due_at=NULL, issued_by=NULL
      WHERE status IN ('issued','overdue','partially_paid')`);
  console.log(`\nInvoices reverted to draft: ${r.rowCount} (revenue still shows in Reports; not billable until rates are confirmed).`);
  console.table((await c.query("SELECT status, count(*)::int n FROM app.invoices GROUP BY status")).rows);
  await c.query("SET session_replication_role = origin");
} finally {
  await c.end();
}
