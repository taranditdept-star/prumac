// Layer 2 — promote staged data into app.* so it shows in the UI.
//  A) enrich vehicles from the register (never overwrite non-null values)
//  B) insert historical trips from the monthly mileage logs (validated, idempotent)
//  C) bump each vehicle's current odometer to the latest reading
import { pgClient, normUpper } from "./lib.mjs";

const ADMIN_TIME_START = "08:00:00+02:00";
const ADMIN_TIME_END = "16:00:00+02:00";
const MAX_DAILY_KM = 5000;

// Known plate typos in the monthly sheets → canonical plate.
const PLATE_ALIAS = {
  "AGH 4081": "AFG 4081", "AFGH 5221": "AGH 5221", "AGE 6139": "AGE 6129",
  "ACF 347017": "CF 347017", "CF 340717": "CF 347017", "CF 237017": "CF 347017",
  "CF 247017": "CF 347017",
};
function canonPlate(raw) {
  if (!raw) return null;
  let p = raw;
  const toks = p.split(" ");
  if (toks.length > 2) {
    const last = toks[toks.length - 1], sl = toks[toks.length - 2];
    if (/^\d+$/.test(last) && /^[A-Z]+$/.test(sl)) p = `${sl} ${last}`; // strip make prefix
  }
  return PLATE_ALIAS[p] || p;
}

const c = await pgClient();
try {
  const admin = (await c.query("SELECT id FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0].id;
  const adminSub = (await c.query("SELECT id FROM app.subsidiaries WHERE code='ADMIN'")).rows[0].id;
  const batch = (await c.query("SELECT id FROM import.batches ORDER BY created_at DESC LIMIT 1")).rows[0].id;

  // ── lookups ───────────────────────────────────────────────────────────────
  const vehicles = (await c.query(
    "SELECT id, plate_number, default_subsidiary_id, current_odometer_km FROM app.vehicles")).rows;
  const vByPlate = new Map(vehicles.map((v) => [v.plate_number, v]));

  const drivers = (await c.query(
    "SELECT d.id, p.full_name FROM app.drivers d JOIN app.profiles p ON p.id=d.profile_id WHERE d.is_active")).rows;
  const byName = new Map();
  for (const d of drivers) { const k = normUpper(d.full_name); if (!byName.has(k)) byName.set(k, d.id); }
  // token → id only when the token belongs to exactly one distinct name
  const tokenNames = new Map();
  for (const k of byName.keys()) for (const t of k.split(" ")) {
    if (t.length < 3) continue;
    if (!tokenNames.has(t)) tokenNames.set(t, new Set());
    tokenNames.get(t).add(k);
  }
  const byToken = new Map();
  for (const [t, names] of tokenNames) if (names.size === 1) byToken.set(t, byName.get([...names][0]));

  // register: plate → driver_id (the vehicle's assigned driver) as a fallback
  const reg = (await c.query("SELECT plate, driver_name FROM import.stg_vehicles WHERE plate IS NOT NULL")).rows;
  const regDriverByPlate = new Map();
  for (const r of reg) {
    const id = resolveDriver(r.driver_name, null);
    if (id) regDriverByPlate.set(r.plate, id);
  }

  function resolveDriver(token, plate) {
    const t = normUpper(token);
    if (t && byName.has(t)) return byName.get(t);
    if (t) for (const part of t.split(" ")) if (byToken.has(part)) return byToken.get(part);
    if (plate && regDriverByPlate.has(plate)) return regDriverByPlate.get(plate);
    return null;
  }

  // ── A) enrich vehicles ─────────────────────────────────────────────────────
  let enriched = 0;
  for (const r of (await c.query(
    `SELECT plate, chassis_number, engine_number, colour, condition_notes, last_service_km
       FROM import.stg_vehicles WHERE plate IS NOT NULL`)).rows) {
    const v = vByPlate.get(canonPlate(r.plate));
    if (!v) continue;
    const lastSvc = r.last_service_km != null && r.last_service_km > 0 && r.last_service_km < 1_500_000
      ? r.last_service_km : null;
    const res = await c.query(
      `UPDATE app.vehicles SET
         vin = COALESCE(vin, $2),
         engine_number = COALESCE(engine_number, $3),
         colour = COALESCE(colour, $4),
         condition_notes = COALESCE(condition_notes, NULLIF($5,'')),
         last_service_odometer_km = COALESCE(last_service_odometer_km, $6)
       WHERE id=$1 AND (vin IS NULL OR engine_number IS NULL OR colour IS NULL
                        OR condition_notes IS NULL OR last_service_odometer_km IS NULL)`,
      [v.id, r.chassis_number, r.engine_number, r.colour, r.condition_notes, lastSvc]);
    if (res.rowCount) enriched++;
  }

  // ── B) insert trips ─────────────────────────────────────────────────────────
  const logs = (await c.query(
    `SELECT id, log_date::text AS d, plate, driver_token, start_km, end_km, route
       FROM import.stg_trip_logs ORDER BY log_date, id`)).rows;

  const seen = new Set(
    (await c.query("SELECT natural_key FROM import.entity_map WHERE kind='trip'")).rows.map((r) => r.natural_key));

  const odoMax = new Map(); // vehicle_id → max end_km
  let inserted = 0, skipped = 0;
  const skips = [];

  for (const l of logs) {
    const plate = canonPlate(l.plate);
    const v = vByPlate.get(plate);
    if (!v) { skipped++; skips.push({ id: l.id, code: "no_vehicle", msg: l.plate }); continue; }
    const start = l.start_km, end = l.end_km;
    if (start == null || end == null || !l.d) { skipped++; skips.push({ id: l.id, code: "incomplete", msg: `${l.plate} ${start}/${end}` }); continue; }
    const dist = end - start;
    if (dist < 0 || dist > MAX_DAILY_KM) { skipped++; skips.push({ id: l.id, code: "bad_distance", msg: `${l.plate} ${dist}km` }); continue; }
    const driverId = resolveDriver(l.driver_token, plate);
    if (!driverId) { skipped++; skips.push({ id: l.id, code: "no_driver", msg: `${l.plate} "${l.driver_token}"` }); continue; }

    const nk = `${v.id}|${l.d}|${start}|${end}`;
    if (seen.has(nk)) { skipped++; continue; }
    seen.add(nk);

    const subId = v.default_subsidiary_id || adminSub;
    const route = (l.route || "").trim() || null;
    let origin = null, dest = null;
    if (route) { const parts = route.split(/[-–→>]+/).map((s) => s.trim()).filter(Boolean); if (parts.length >= 2) { origin = parts[0].slice(0, 120); dest = parts[parts.length - 1].slice(0, 120); } }

    const trip = (await c.query(
      `INSERT INTO app.trips
         (vehicle_id, driver_id, subsidiary_id, purpose, status,
          route_description, origin_label, destination_label,
          start_odometer_km, end_odometer_km,
          started_at, ended_at, completed_at, created_by)
       VALUES ($1,$2,$3,'delivery','completed',$4,$5,$6,$7,$8,
               ($9||' '||$10)::timestamptz, ($9||' '||$11)::timestamptz, ($9||' '||$11)::timestamptz, $12)
       RETURNING id`,
      [v.id, driverId, subId, route ? route.slice(0, 500) : null, origin, dest,
       start, end, l.d, ADMIN_TIME_START, ADMIN_TIME_END, admin])
    ).rows[0].id;

    await c.query(
      "INSERT INTO import.entity_map (batch_id, kind, natural_key, app_id, action) VALUES ($1,'trip',$2,$3,'inserted') ON CONFLICT (kind, natural_key) DO NOTHING",
      [batch, nk, trip]);

    odoMax.set(v.id, Math.max(odoMax.get(v.id) ?? 0, end));
    inserted++;
  }

  // ── C) bump current odometer to the latest imported reading ────────────────
  let odoUpd = 0;
  for (const [vid, mx] of odoMax) {
    const res = await c.query(
      "UPDATE app.vehicles SET current_odometer_km=$2 WHERE id=$1 AND current_odometer_km < $2", [vid, mx]);
    odoUpd += res.rowCount;
  }

  // log skips (sample) to import.errors
  for (const s of skips.slice(0, 500)) {
    await c.query(
      "INSERT INTO import.errors (batch_id, sheet_name, row_index, severity, code, message) VALUES ($1,'normalize',$2,'warning',$3,$4)",
      [batch, s.id, s.code, s.msg]);
  }
  await c.query("UPDATE import.batches SET status='normalized' WHERE id=$1", [batch]);

  const byReason = {};
  for (const s of skips) byReason[s.code] = (byReason[s.code] || 0) + 1;
  console.log(`Vehicles enriched: ${enriched}`);
  console.log(`Trips inserted:    ${inserted}`);
  console.log(`Odometers bumped:  ${odoUpd}`);
  console.log(`Skipped:           ${skipped}`, byReason);
} finally {
  await c.end();
}
