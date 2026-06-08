// Promote the maintenance/repairs detail block (DATE|MAKE|PLATE|DETAILS|AMOUNT)
// into app.service_records, and put fuel cost onto the imported trips.
import xlsx from "xlsx";
import { pgClient, norm, normUpper, normPlate, toNum, toDate } from "./lib.mjs";

const FILE = process.argv[2] || "E:/Downloads/PRUMAC VEHICLE REGISTER (2).xlsx";

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
// make keyword → plate (for rows where the plate cell is blank, e.g. GRABBER)
const MAKE_PLATE = [["GRABBER", "AFQ 3770"], ["SCANIA", "AGB 1400"], ["IVECO", "AFQ 7950"]];
function plateFromMake(make) {
  const m = normUpper(make);
  for (const [kw, plate] of MAKE_PLATE) if (m.includes(kw)) return plate;
  return null;
}

const c = await pgClient();
try {
  const admin = (await c.query("SELECT id FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0].id;
  const batch = (await c.query("SELECT id FROM import.batches ORDER BY created_at DESC LIMIT 1")).rows[0].id;
  const vehicles = (await c.query("SELECT id, plate_number, default_subsidiary_id FROM app.vehicles")).rows;
  const vByPlate = new Map(vehicles.map((v) => [v.plate_number, v]));

  const wb = xlsx.readFile(FILE, { cellDates: true });
  const seen = new Set(
    (await c.query("SELECT natural_key FROM import.entity_map WHERE kind='service'")).rows.map((r) => r.natural_key));

  let svc = 0, svcSkip = 0;
  for (const name of wb.SheetNames) {
    if (/REGISTER/i.test(name)) continue;
    const grid = xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });

    // find the maintenance header row: contains DETAILS + AMOUNT + PLATE
    let hr = -1, dCol = -1, aCol = -1;
    for (let i = 0; i < grid.length; i++) {
      const cells = (grid[i] || []).map((x) => normUpper(x));
      const di = cells.findIndex((x) => x === "DETAILS");
      const ai = cells.findIndex((x) => x.includes("AMOUNT"));
      if (di >= 0 && ai > di && cells.some((x) => x.includes("PLATE"))) { hr = i; dCol = di; aCol = ai; break; }
    }
    if (hr < 0) continue;
    const dateCol = dCol - 3, makeCol = dCol - 2, plateCol = dCol - 1;

    let lastDate = null, buffer = [];
    for (let i = hr + 1; i < grid.length; i++) {
      const r = grid[i] || [];
      const det = norm(r[dCol]);
      const amt = toNum(r[aCol]);
      const dd = toDate(r[dateCol]);
      if (dd) lastDate = dd;
      const makeRaw = norm(r[makeCol]);
      const plateRaw = normPlate(r[plateCol]);
      if (/^TOTAL/i.test(det) || /^TOTAL/i.test(makeRaw)) { buffer = []; continue; }
      if (!det && amt == null) continue;
      if (det && amt == null) { buffer.push(det); continue; } // sub-item line → attach to next amount row

      // amount-bearing row → one service record
      const plate = plateRaw || plateFromMake(makeRaw);
      const v = plate ? vByPlate.get(canonPlate(plate)) : null;
      const summary = [...buffer, det].filter(Boolean).join(", ").slice(0, 500);
      buffer = [];
      if (!v || !lastDate || amt == null || amt <= 0) { svcSkip++; continue; }

      const nk = `${v.id}|${lastDate}|${summary.slice(0, 60)}|${amt}`;
      if (seen.has(nk)) continue;
      seen.add(nk);
      const routine = /SERVICE KIT|FULL SERVICE/i.test(summary);
      const sr = (await c.query(
        `INSERT INTO app.service_records
           (vehicle_id, performed_at, is_routine_service, total_amount, currency,
            reimburse_from_subsidiary_id, summary, created_by)
         VALUES ($1,$2,$3,$4,'USD',$5,$6,$7) RETURNING id`,
        [v.id, lastDate, routine, amt, v.default_subsidiary_id, summary, admin])).rows[0].id;
      await c.query(
        "INSERT INTO import.entity_map (batch_id, kind, natural_key, app_id, action) VALUES ($1,'service',$2,$3,'inserted') ON CONFLICT (kind, natural_key) DO NOTHING",
        [batch, nk, sr]);
      svc++;
    }
  }

  // ── fuel cost onto trips ─────────────────────────────────────────────────
  // stg_trip_logs.fuel_raw like "FUEL $45.00" or a number → trips.fuel_amount.
  const fuelRows = (await c.query(
    `SELECT l.plate, l.log_date::text d, l.start_km, l.end_km, l.fuel_raw
       FROM import.stg_trip_logs l WHERE l.fuel_raw IS NOT NULL AND l.fuel_raw <> ''`)).rows;
  const mapRows = (await c.query("SELECT natural_key, app_id FROM import.entity_map WHERE kind='trip'")).rows;
  const tripByNk = new Map(mapRows.map((r) => [r.natural_key, r.app_id]));
  let fuelUpd = 0;
  for (const f of fuelRows) {
    const amt = toNum((f.fuel_raw.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/) || [])[1]);
    if (amt == null || amt <= 0) continue;
    const v = vByPlate.get(canonPlate(f.plate));
    if (!v || f.start_km == null || f.end_km == null) continue;
    const nk = `${v.id}|${f.d}|${f.start_km}|${f.end_km}`;
    const tripId = tripByNk.get(nk);
    if (!tripId) continue;
    const res = await c.query(
      "UPDATE app.trips SET fuel_amount=$2 WHERE id=$1 AND fuel_amount IS NULL", [tripId, amt]);
    fuelUpd += res.rowCount;
  }

  // ── fix the source date typo (JULY rows entered as 2026 instead of 2025) ──
  const fix = await c.query(
    `UPDATE app.trips SET started_at=started_at - interval '1 year',
        ended_at=ended_at - interval '1 year', completed_at=completed_at - interval '1 year'
      WHERE status='completed' AND started_at >= '2026-07-01'`);

  console.log(`Service/repair records inserted: ${svc} (skipped ${svcSkip})`);
  console.log(`Trips updated with fuel cost:    ${fuelUpd}`);
  console.log(`Future-dated typo trips fixed:   ${fix.rowCount}`);
} finally {
  await c.end();
}
