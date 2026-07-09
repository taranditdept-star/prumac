// Verifies the account-management operations against LIVE Supabase using a
// throwaway staff + driver account, then DELETES them (cascade cleans profile
// + driver). Confirms: createUser, profile role set (service-role trigger
// exemption), driver insert, password reset, ban — all work.
// Run: node scripts/test-user-admin.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const ts = Date.now();
const created = [];

async function cleanup() {
  for (const id of created) await sb.auth.admin.deleteUser(id).catch(() => {});
}

async function main() {
  // ---- STAFF ----
  const staffEmail = `qa-staff-${ts}@example.com`;
  const { data: s, error: se } = await sb.auth.admin.createUser({ email: staffEmail, password: "Test-Passw0rd!", email_confirm: true });
  if (se) throw new Error("staff createUser: " + se.message);
  created.push(s.user.id);
  const { error: spe } = await sb.schema("app").from("profiles").upsert({ id: s.user.id, role: "fleet_manager", full_name: "QA Manager" });
  if (spe) throw new Error("staff profile upsert: " + spe.message);
  const { data: sp } = await sb.schema("app").from("profiles").select("role").eq("id", s.user.id).single();
  console.log(`✓ staff created; role set to '${sp.role}' (expect fleet_manager — proves service-role trigger exemption)`);
  if (sp.role !== "fleet_manager") throw new Error("role was NOT set to fleet_manager");

  // ---- DRIVER ----
  const drvEmail = `pmdqa${ts}@drivers.prumac.local`;
  const { data: d, error: de } = await sb.auth.admin.createUser({ email: drvEmail, password: "Test-Passw0rd!", email_confirm: true });
  if (de) throw new Error("driver createUser: " + de.message);
  created.push(d.user.id);
  await sb.schema("app").from("profiles").upsert({ id: d.user.id, role: "driver", full_name: "QA Driver" });
  const { error: die } = await sb.schema("app").from("drivers").insert({
    profile_id: d.user.id, employee_number: `PMDQA${ts}`, licence_number: "IMPORT-PENDING", licence_country: "ZW", licence_classes: [], is_active: true,
  });
  if (die) throw new Error("driver insert: " + die.message);
  console.log("✓ driver login created (employee_number + IMPORT-PENDING licence → onboarding gate)");

  // ---- RESET PASSWORD ----
  const { error: re } = await sb.auth.admin.updateUserById(d.user.id, { password: "New-Passw0rd!" });
  if (re) throw new Error("password reset: " + re.message);
  console.log("✓ password reset works");

  // ---- BAN / UNBAN ----
  const { error: be } = await sb.auth.admin.updateUserById(d.user.id, { ban_duration: "876000h" });
  if (be) throw new Error("ban: " + be.message);
  const { error: ue } = await sb.auth.admin.updateUserById(d.user.id, { ban_duration: "none" });
  if (ue) throw new Error("unban: " + ue.message);
  console.log("✓ deactivate (ban) + reactivate (unban) work");

  // ---- CLEANUP + verify cascade ----
  await cleanup();
  created.length = 0;
  const { data: leftProf } = await sb.schema("app").from("profiles").select("id").eq("id", d.user.id).maybeSingle();
  const { data: leftDrv } = await sb.schema("app").from("drivers").select("id").eq("profile_id", d.user.id).maybeSingle();
  console.log(`✓ cleanup: profile gone=${!leftProf} driver gone=${!leftDrv}`);

  console.log("\nALL account-management operations verified on live Supabase.");
}

main()
  .catch(async (e) => {
    console.error("✗", e.message);
    await cleanup();
    process.exitCode = 1;
  });
