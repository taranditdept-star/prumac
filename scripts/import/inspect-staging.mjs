import { pgClient } from "./lib.mjs";
const c = await pgClient();
const q = async (label, sql, params = []) => {
  const r = await c.query(sql, params);
  console.log(`\n=== ${label} ===`);
  console.table(r.rows);
};
try {
  await q("date range + counts per sheet", `
    SELECT sheet_name, count(*) rows, min(log_date) min_date, max(log_date) max_date,
           count(*) FILTER (WHERE log_date IS NULL) no_date
    FROM import.stg_trip_logs GROUP BY sheet_name
    ORDER BY min(log_date) NULLS LAST`);
  await q("overall date span", `SELECT min(log_date), max(log_date), count(*) FROM import.stg_trip_logs`);
  await q("plates in logs NOT matching a vehicle", `
    SELECT l.plate, count(*) n FROM import.stg_trip_logs l
    LEFT JOIN app.vehicles v ON v.plate_number=l.plate
    WHERE v.id IS NULL GROUP BY l.plate ORDER BY n DESC`);
  await q("rows missing start/end/date", `
    SELECT count(*) FILTER (WHERE start_km IS NULL) no_start,
           count(*) FILTER (WHERE end_km IS NULL) no_end,
           count(*) FILTER (WHERE log_date IS NULL) no_date,
           count(*) FILTER (WHERE end_km < start_km) rollback
    FROM import.stg_trip_logs`);
  await q("distinct driver tokens (top 30)", `
    SELECT driver_token, count(*) n FROM import.stg_trip_logs
    WHERE driver_token IS NOT NULL GROUP BY driver_token ORDER BY n DESC LIMIT 30`);
  await q("charge-block departments seen", `
    SELECT department, count(*) n FROM import.stg_vehicle_charges
    WHERE department IS NOT NULL AND department<>'' GROUP BY department ORDER BY n DESC`);
  await q("parse notes", `SELECT sheet_name, code, message FROM import.errors ORDER BY id`);
  await q("sample trip rows", `
    SELECT sheet_name, log_date, plate, driver_token, start_km, end_km, route FROM import.stg_trip_logs
    ORDER BY log_date LIMIT 8`);
} finally { await c.end(); }
