import { pgClient } from "./lib.mjs";
const c = await pgClient();
console.log("admin profile:", (await c.query("SELECT id, full_name FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0]);
console.log("ADMIN sub:", (await c.query("SELECT id FROM app.subsidiaries WHERE code='ADMIN'")).rows[0]);
console.log("vehicles with default_subsidiary:", (await c.query("SELECT count(*) FILTER (WHERE default_subsidiary_id IS NOT NULL) withsub, count(*) total FROM app.vehicles")).rows[0]);
console.log("register stg sample:", (await c.query("SELECT plate, driver_name, chassis_number, engine_number, colour, last_service_km FROM import.stg_vehicles WHERE plate IS NOT NULL LIMIT 6")).rows);
await c.end();
