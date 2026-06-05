// Seed a few live (in_progress) trips with recent GPS pings so /live/map shows
// moving vehicles. Idempotent: clears any previous "LIVE DEMO" trips first.
// Uses free driver/vehicle pairs and leaves Blessing Shumba free for testing.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Three routes around Harare with a start anchor + per-step delta (deg).
const ROUTES = [
  { label: "LIVE DEMO · Harare CBD → Msasa", lat: -17.8292, lng: 31.0522, dLat: 0.0016, dLng: 0.0021, speed: 38 },
  { label: "LIVE DEMO · Harare → Chitungwiza", lat: -17.9100, lng: 31.0750, dLat: -0.0024, dLng: 0.0008, speed: 64 },
  { label: "LIVE DEMO · Borrowdale loop", lat: -17.7600, lng: 31.0900, dLat: 0.0010, dLng: -0.0018, speed: 27 },
];

function heading(dLat, dLng) {
  const deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

async function main() {
  await client.connect();
  try {
    // Clear previous demo trips (cascades to their pings).
    await client.query("DELETE FROM app.trips WHERE route_description LIKE 'LIVE DEMO%'");

    // Free drivers (no open trip) and free, non-decommissioned vehicles — exclude Blessing.
    const drivers = (
      await client.query(`
        SELECT d.id FROM app.drivers d
        JOIN app.profiles p ON p.id = d.profile_id
        WHERE d.is_active AND p.full_name <> 'Blessing Shumba'
          AND NOT EXISTS (SELECT 1 FROM app.trips t WHERE t.driver_id = d.id AND t.status IN ('in_progress','paused','ended'))
        ORDER BY p.full_name LIMIT 3`)
    ).rows;
    const vehicles = (
      await client.query(`
        SELECT v.id, COALESCE(v.default_subsidiary_id, (SELECT id FROM app.subsidiaries ORDER BY name LIMIT 1)) AS sub
        FROM app.vehicles v
        WHERE v.status <> 'decommissioned'
          AND v.id NOT IN ('22222222-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000021')
          AND NOT EXISTS (SELECT 1 FROM app.trips t WHERE t.vehicle_id = v.id AND t.status IN ('in_progress','paused','ended'))
        ORDER BY v.current_odometer_km DESC LIMIT 3`)
    ).rows;

    const n = Math.min(drivers.length, vehicles.length, ROUTES.length);
    if (n === 0) {
      console.log("No free driver/vehicle pairs available.");
      return;
    }

    for (let i = 0; i < n; i++) {
      const r = ROUTES[i];
      const { rows } = await client.query(
        `INSERT INTO app.trips (vehicle_id, driver_id, subsidiary_id, purpose, status, route_description, started_at, start_odometer_km)
         VALUES ($1,$2,$3,'delivery','in_progress',$4, now() - interval '40 minutes', 100000)
         RETURNING id`,
        [vehicles[i].id, drivers[i].id, vehicles[i].sub, r.label],
      );
      const tripId = rows[0].id;

      // 8 pings over the last ~14 min, ending ~now (fresh = green marker).
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const lat = r.lat + r.dLat * s;
        const lng = r.lng + r.dLng * s;
        const secondsAgo = (steps - 1 - s) * 110; // newest ~0s old
        await client.query(
          `INSERT INTO app.trip_locations (trip_id, recorded_at, point, speed_kph, heading_deg, accuracy_m)
           VALUES ($1, now() - ($2 || ' seconds')::interval,
                   ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5, $6, 8)`,
          [tripId, secondsAgo, lng, lat, r.speed + (s % 3) * 4, heading(r.dLat, r.dLng)],
        );
      }
      console.log(`  ✓ ${r.label}`);
    }

    const live = await client.query("SELECT count(*) FROM app.fn_live_fleet_positions()");
    console.log(`Live map now shows ${live.rows[0].count} vehicle(s).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
