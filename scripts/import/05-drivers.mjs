// Create the drivers that appear in the monthly logs but weren't in the seed,
// then re-attribute their trips (which the import had fallen back to the
// vehicle's register driver, or mis-token-matched, e.g. EDSON→Brighton).
//
// Only genuinely-distinct people are created; ambiguous partial tokens that
// already map to an existing driver are left as-is. Placeholder licence; the
// real licence/phone are filled in when each driver onboards via OTP.
import { pgClient, normUpper, normPlate } from "./lib.mjs";

const PLATE_ALIAS = {
  "AGH 4081": "AFG 4081", "AFGH 5221": "AGH 5221", "AGE 6139": "AGE 6129",
  "ACF 347017": "CF 347017", "CF 340717": "CF 347017", "CF 237017": "CF 347017", "CF 247017": "CF 347017",
};
function canonPlate(raw) {
  if (!raw) return null;
  let p = raw; const t = p.split(" ");
  if (t.length > 2 && /^\d+$/.test(t[t.length - 1]) && /^[A-Z]+$/.test(t[t.length - 2])) p = `${t[t.length - 2]} ${t[t.length - 1]}`;
  return PLATE_ALIAS[p] || p;
}

// Stable profile UUIDs so re-runs are idempotent (don't create duplicates).
const NEW_DRIVERS = [
  { id: "dd000000-0000-4000-8000-000000000001", name: "Edson Muchemwa",   tokens: ["EDSON MUCHEMWA", "EDSON"] },
  { id: "dd000000-0000-4000-8000-000000000002", name: "Emmanuel Mudzuri", tokens: ["EMMANUEL MUDZURI", "MUDZURI"] },
  { id: "dd000000-0000-4000-8000-000000000003", name: "Blessing Muzorori", tokens: ["BLESSING MUZORORI"] },
  { id: "dd000000-0000-4000-8000-000000000004", name: "David Gondwe",     tokens: ["DAVID GONDWE"] },
  { id: "dd000000-0000-4000-8000-000000000005", name: "Eddy",             tokens: ["EDDY"] },
  { id: "dd000000-0000-4000-8000-000000000006", name: "Gaffa",            tokens: ["GAFFA"] },
  { id: "dd000000-0000-4000-8000-000000000007", name: "Trevor",           tokens: ["TREVOR"] },
  { id: "dd000000-0000-4000-8000-000000000008", name: "Gina",             tokens: ["GINA"] },
  { id: "dd000000-0000-4000-8000-000000000009", name: "Melusi",           tokens: ["MELUSI"] },
  { id: "dd000000-0000-4000-8000-000000000010", name: "Jackson",          tokens: ["JACKSON"] },
  { id: "dd000000-0000-4000-8000-000000000011", name: "Manatsa",          tokens: ["MANATSA"] },
  { id: "dd000000-0000-4000-8000-000000000012", name: "Washe",            tokens: ["WASHE"] },
];

const c = await pgClient();
try {
  // 1) create / upsert the drivers (stub auth user → profile → driver),
  //    replicating the dropped seed helper. Idempotent on the stable id.
  const tokenToDriver = new Map();
  for (const d of NEW_DRIVERS) {
    await c.query(
      `INSERT INTO auth.users (id, email, phone, instance_id, aud, role,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, email_change_token_new, email_change, recovery_token, is_super_admin)
       VALUES ($1, NULL, NULL, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         '{"provider":"phone","providers":["phone"]}'::jsonb, jsonb_build_object('full_name', $2::text),
         now(), now(), '', '', '', '', false)
       ON CONFLICT (id) DO NOTHING`, [d.id, d.name]);
    await c.query(
      `INSERT INTO app.profiles (id, full_name, phone, role, is_active)
       VALUES ($1, $2, NULL, 'driver', true)
       ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name, role='driver', is_active=true`,
      [d.id, d.name]);
    const driverId = (await c.query(
      `INSERT INTO app.drivers (profile_id, licence_number, licence_country, is_active)
       VALUES ($1, 'IMPORT-PENDING', 'ZW', true)
       ON CONFLICT (profile_id) DO UPDATE SET is_active=true RETURNING id`, [d.id])).rows[0].id;
    for (const tk of d.tokens) tokenToDriver.set(tk, driverId);
  }
  console.log(`Drivers created/ensured: ${NEW_DRIVERS.length}`);

  // 2) map every imported trip's token → trip_id via the staging rows + entity_map
  const v = (await c.query("SELECT id, plate_number FROM app.vehicles")).rows;
  const vByPlate = new Map(v.map((x) => [x.plate_number, x.id]));
  const em = (await c.query("SELECT natural_key, app_id FROM import.entity_map WHERE kind='trip'")).rows;
  const tripByNk = new Map(em.map((r) => [r.natural_key, r.app_id]));
  const logs = (await c.query(
    "SELECT plate, log_date::text d, start_km, end_km, driver_token FROM import.stg_trip_logs WHERE driver_token IS NOT NULL")).rows;

  // collect trip_id → newDriverId where the token belongs to a new driver
  const updates = new Map();
  for (const l of logs) {
    const drv = tokenToDriver.get(normUpper(l.driver_token));
    if (!drv) continue;
    const vid = vByPlate.get(canonPlate(normPlate(l.plate)));
    if (!vid || l.start_km == null || l.end_km == null || !l.d) continue;
    const tripId = tripByNk.get(`${vid}|${l.d}|${l.start_km}|${l.end_km}`);
    if (tripId) updates.set(tripId, drv);
  }

  // 3) apply re-attribution
  let changed = 0;
  for (const [tripId, drv] of updates) {
    const res = await c.query(
      "UPDATE app.trips SET driver_id=$2 WHERE id=$1 AND driver_id<>$2", [tripId, drv]);
    changed += res.rowCount;
  }

  console.log(`Trips re-attributed to the correct driver: ${changed}`);
  console.log("\nNew drivers + trip counts:");
  const counts = await c.query(
    `SELECT p.full_name, count(t.id)::int trips
       FROM app.profiles p JOIN app.drivers d ON d.profile_id=p.id
       LEFT JOIN app.trips t ON t.driver_id=d.id
      WHERE p.id = ANY($1) GROUP BY p.full_name ORDER BY trips DESC`,
    [NEW_DRIVERS.map((x) => x.id)]);
  console.table(counts.rows);
} finally {
  await c.end();
}
