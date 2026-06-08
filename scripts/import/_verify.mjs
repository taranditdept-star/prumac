import { pgClient } from "./lib.mjs";
const c = await pgClient();
const span = (await c.query("SELECT count(*)::int n, min(started_at)::date mn, max(started_at)::date mx FROM app.trips WHERE status='completed'")).rows[0];
console.log("completed trips:", span);
console.log("\nper-month:");
console.table((await c.query("SELECT to_char(started_at,'YYYY-MM') m, count(*)::int trips FROM app.trips WHERE status='completed' GROUP BY 1 ORDER BY 1")).rows);
console.log("\nsample (joins resolve for UI):");
console.table((await c.query(`
  SELECT started_at::date d, v.plate_number plate, v.make, p.full_name driver, s.name subsidiary,
         t.route_description route, (t.end_odometer_km - t.start_odometer_km) dist_km
  FROM app.trips t
  JOIN app.vehicles v ON v.id=t.vehicle_id
  JOIN app.drivers dr ON dr.id=t.driver_id JOIN app.profiles p ON p.id=dr.profile_id
  JOIN app.subsidiaries s ON s.id=t.subsidiary_id
  WHERE t.status='completed' ORDER BY started_at LIMIT 6`)).rows);
const orphans = (await c.query("SELECT count(*)::int n FROM app.trips t WHERE NOT EXISTS(SELECT 1 FROM app.subsidiaries s WHERE s.id=t.subsidiary_id) OR NOT EXISTS(SELECT 1 FROM app.drivers d WHERE d.id=t.driver_id)")).rows[0].n;
console.log("\ntrips with broken FK (should be 0):", orphans);
await c.end();
