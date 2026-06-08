import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const tables = ["vehicles", "drivers", "profiles", "trips", "billing_rates", "fuel_logs", "service_records", "vehicle_assignments", "subsidiaries"];
for (const t of tables) {
  const cols = await c.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema='app' AND table_name=$1 ORDER BY ordinal_position`, [t]
  );
  console.log(`\n=== app.${t} ===`);
  for (const r of cols.rows) {
    console.log(`  ${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}${r.column_default ? " def=" + String(r.column_default).slice(0,30) : ""}`);
  }
}
// Existing data to match against
console.log("\n=== existing vehicles ===");
const v = await c.query("SELECT plate_number, make, model, class, current_odometer_km FROM app.vehicles ORDER BY plate_number");
console.log(v.rows.map(r => `${r.plate_number} | ${r.make} ${r.model} | ${r.class} | odo=${r.current_odometer_km}`).join("\n"));
console.log(`(${v.rows.length} vehicles)`);
console.log("\n=== existing drivers ===");
const d = await c.query("SELECT d.id, p.full_name, d.is_active FROM app.drivers d LEFT JOIN app.profiles p ON p.id=d.profile_id ORDER BY p.full_name");
console.log(d.rows.map(r => `${r.full_name} | active=${r.is_active}`).join("\n"));
console.log(`(${d.rows.length} drivers)`);
console.log("\n=== subsidiaries ===");
const s = await c.query("SELECT code, name FROM app.subsidiaries ORDER BY name");
console.log(s.rows.map(r => `${r.code} | ${r.name}`).join("\n"));
console.log("\n=== trips count ===");
console.log((await c.query("SELECT count(*)::int n, min(started_at) mn, max(started_at) mx FROM app.trips")).rows[0]);
await c.end();
