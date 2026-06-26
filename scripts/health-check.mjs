// Live-system health check (read-only). Run: node scripts/health-check.mjs
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
const q = async (sql) => (await c.query(sql)).rows;
const one = async (sql) => (await c.query(sql)).rows[0];
const section = (t) => console.log(`\n━━ ${t} ━━`);

try {
  section("DRIVERS / ONBOARDING");
  const dr = await one(`select
    count(*) filter (where d.is_active) as active,
    count(*) filter (where d.is_active and d.licence_number='IMPORT-PENDING') as needs_onboarding,
    count(*) filter (where d.is_active and d.licence_number<>'IMPORT-PENDING') as onboarded,
    count(*) filter (where d.is_active and p.phone is null) as no_phone
    from app.drivers d join app.profiles p on p.id=d.profile_id`);
  console.log(`active drivers: ${dr.active}`);
  console.log(`  onboarded (licence set): ${dr.onboarded}   still pending: ${dr.needs_onboarding}   no phone: ${dr.no_phone}`);
  const recent = await q(`select p.full_name, d.licence_number, p.phone, d.updated_at::date
    from app.drivers d join app.profiles p on p.id=d.profile_id
    where d.updated_at > now()-interval '2 days' and d.licence_number<>'IMPORT-PENDING'
    order by d.updated_at desc limit 10`);
  console.log(`recently onboarded (last 2d): ${recent.length}`);
  for (const r of recent) console.log(`   ✓ ${r.full_name} · ${r.licence_number} · ${r.phone ?? "no phone"}`);
  const dupes = await q(`select p.full_name, count(*) n from app.drivers d join app.profiles p on p.id=d.profile_id
    where d.is_active group by p.full_name having count(*)>1 order by n desc`);
  if (dupes.length) console.log("⚠ duplicate driver names:", dupes.map((d) => `${d.full_name}×${d.n}`).join(", "));

  section("LOGINS (auth)");
  const auth = await one(`select
    count(*) filter (where employee_number is not null) as with_emp_no
    from app.drivers where is_active`);
  console.log(`drivers with a PMD id: ${auth.with_emp_no}`);
  const staff = await q(`select role, count(*) n from app.profiles where role<>'driver' group by role order by role`);
  console.log("staff accounts:", staff.map((s) => `${s.role}×${s.n}`).join(", "));

  section("ALERTING / PUSH");
  const subs = await q(`select pr.role, count(*) n from app.push_subscriptions s join app.profiles pr on pr.id=s.profile_id group by pr.role`);
  console.log("push subscriptions:", subs.length ? subs.map((s) => `${s.role}×${s.n}`).join(", ") : "NONE");
  const al = await one(`select
    count(*) filter (where resolved_at is null) as open,
    count(*) filter (where kind='accident_reported' and raised_at>now()-interval '24 hours') as accidents_24h
    from app.alerts`);
  console.log(`open alerts: ${al.open}   accidents (24h): ${al.accidents_24h}`);

  section("TRIPS ACTIVITY");
  const tr = await q(`select status, count(*) n from app.trips where started_at>now()-interval '7 days' group by status order by n desc`);
  console.log("last 7 days:", tr.length ? tr.map((t) => `${t.status}×${t.n}`).join(", ") : "no trips");
  const stuck = await q(`select pl.plate_number, p.full_name, t.started_at::date
    from app.trips t join app.vehicles pl on pl.id=t.vehicle_id join app.drivers d on d.id=t.driver_id join app.profiles p on p.id=d.profile_id
    where t.status in ('in_progress','paused') and t.started_at < now()-interval '1 day' order by t.started_at limit 10`);
  if (stuck.length) console.log(`⚠ ${stuck.length} trip(s) open >24h:`, stuck.map((s) => `${s.plate_number}/${s.full_name}`).join(", "));
  else console.log("no trips stuck open >24h");

  section("VEHICLE ASSIGNMENTS");
  const va = await one(`select
    (select count(*) from app.vehicle_assignments where ended_at is null) as active,
    (select count(*) from app.vehicles where status<>'decommissioned'
       and id not in (select vehicle_id from app.vehicle_assignments where ended_at is null)) as unassigned`);
  console.log(`active assignments: ${va.active}   active vehicles with NO driver: ${va.unassigned}`);

  section("BILLING");
  const inv = await q(`select status, count(*) n, round(sum(total_due)::numeric,2) total from app.invoices group by status order by n desc`);
  for (const r of inv) console.log(`   ${r.status}: ${r.n} ($${r.total})`);

  section("COMPLIANCE (vehicle docs)");
  const docs = await one(`select
    count(*) filter (where expires_at < now()::date) as expired,
    count(*) filter (where expires_at >= now()::date and expires_at < now()::date+interval '30 days') as expiring_30d
    from app.vehicle_documents where is_active`);
  console.log(`expired docs: ${docs.expired}   expiring within 30d: ${docs.expiring_30d}`);

  console.log("\n✓ health check complete");
} catch (e) {
  console.error("ERR", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
