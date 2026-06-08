// Layer 1 (raw preservation) + parsing into import.stg_* tables.
// Idempotent: re-running re-imports the same file's batch cleanly.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import xlsx from "xlsx";
import {
  pgClient, norm, normUpper, normPlate, toNum, toInt, toDate,
  detectTripHeader, detectChargeHeader,
} from "./lib.mjs";

const FILE = process.argv[2] || "E:/Downloads/PRUMAC VEHICLE REGISTER (2).xlsx";

// Batched parameterized multi-row insert.
async function insertRows(c, table, cols, rows) {
  if (!rows.length) return 0;
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of slice) {
      values.push(`(${cols.map(() => `$${p++}`).join(",")})`);
      for (const col of cols) params.push(r[col] ?? null);
    }
    const res = await c.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${values.join(",")}`, params,
    );
    total += res.rowCount;
  }
  return total;
}

const c = await pgClient();
try {
  const buf = readFileSync(FILE);
  const sha = createHash("sha256").update(buf).digest("hex");
  const filename = FILE.split(/[\\/]/).pop();
  const wb = xlsx.read(buf, { cellDates: true });

  // Upsert batch by file hash; wipe its children for a clean re-import.
  const existing = await c.query("SELECT id FROM import.batches WHERE file_sha256=$1", [sha]);
  let batchId;
  if (existing.rows.length) {
    batchId = existing.rows[0].id;
    await c.query("DELETE FROM import.sheets WHERE batch_id=$1", [batchId]); // cascades raw_rows
    for (const t of ["stg_vehicles", "stg_trip_logs", "stg_vehicle_charges", "errors"]) {
      await c.query(`DELETE FROM import.${t} WHERE batch_id=$1`, [batchId]);
    }
    await c.query("UPDATE import.batches SET sheet_count=$2, status='raw' WHERE id=$1", [batchId, wb.SheetNames.length]);
    console.log("Re-importing existing batch", batchId);
  } else {
    batchId = (await c.query(
      "INSERT INTO import.batches (source_filename, file_sha256, sheet_count, status) VALUES ($1,$2,$3,'raw') RETURNING id",
      [filename, sha, wb.SheetNames.length],
    )).rows[0].id;
    console.log("New batch", batchId);
  }

  const errors = [];
  const stgVehicles = [], stgTripLogs = [], stgCharges = [];

  for (let s = 0; s < wb.SheetNames.length; s++) {
    const name = wb.SheetNames[s];
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] || null;
    const grid = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const nonblank = grid.map((r, idx) => ({ idx, cells: (r || []) }))
      .filter((r) => r.cells.some((v) => v !== null && v !== undefined && String(v).trim() !== ""));

    const isRegister = /VEHICLE.?S? REGISTER/i.test(name);
    const tripHdr = isRegister ? null : detectTripHeader(grid);
    const chargeHdr = isRegister ? null : detectChargeHeader(grid);
    const layout = isRegister ? "register" : (tripHdr ? `triplog@${tripHdr.headerRow}` : "unknown");

    const sheetId = (await c.query(
      "INSERT INTO import.sheets (batch_id, sheet_index, sheet_name, ref, row_count, detected_layout) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [batchId, s, name, ref, nonblank.length, layout],
    )).rows[0].id;

    // Raw rows (lossless) — store each non-blank row's cells as jsonb.
    await c.query(
      `INSERT INTO import.raw_rows (sheet_id, row_index, cells)
       SELECT $1, (e->>'i')::int, e->'c' FROM jsonb_array_elements($2::jsonb) AS e`,
      [sheetId, JSON.stringify(nonblank.map((r) => ({ i: r.idx, c: r.cells })))],
    );

    if (isRegister) {
      parseRegister(grid, batchId, stgVehicles, errors, name);
    } else if (tripHdr) {
      parseTripLogs(grid, tripHdr, batchId, name, stgTripLogs, errors);
      if (chargeHdr) parseCharges(grid, chargeHdr, batchId, name, stgCharges);
      else errors.push({ batch_id: batchId, sheet_name: name, row_index: null, severity: "info", code: "no_charge_block", message: "No VEHICLE CHARGES block detected" });
    } else {
      errors.push({ batch_id: batchId, sheet_name: name, row_index: null, severity: "warning", code: "no_trip_header", message: "Could not detect a trip-log header" });
    }
  }

  const nV = await insertRows(c, "import.stg_vehicles",
    ["batch_id", "plate", "make", "driver_name", "driver_phone", "colour", "chassis_number", "engine_number", "mileage_km", "last_service_km", "licence_expiry", "insurance_type", "condition_notes", "suspension_note"], stgVehicles);
  const nT = await insertRows(c, "import.stg_trip_logs",
    ["batch_id", "sheet_name", "row_index", "log_date", "plate", "driver_token", "vehicle_make", "start_km", "end_km", "route", "fuel_raw", "distance_km", "charge_per_km", "total_amount"], stgTripLogs);
  const nC = await insertRows(c, "import.stg_vehicle_charges",
    ["batch_id", "sheet_name", "plate", "vehicle_make", "department", "km_travelled", "charge_per_km", "total_amount", "maintenance", "amount_payable"], stgCharges);
  await insertRows(c, "import.errors", ["batch_id", "sheet_name", "row_index", "severity", "code", "message"], errors);

  await c.query("UPDATE import.batches SET status='parsed' WHERE id=$1", [batchId]);
  console.log(`\nParsed: ${nV} register-vehicles, ${nT} trip-log rows, ${nC} charge rows, ${errors.length} notes`);
} finally {
  await c.end();
}

// ── parsers ────────────────────────────────────────────────────────────────
function parseRegister(grid, batchId, out, errors, sheetName) {
  // Header at the row containing "PLATE NUMBER" + "DRIVER".
  let hr = -1;
  for (let i = 0; i < Math.min(grid.length, 6); i++) {
    const cells = (grid[i] || []).map((x) => normUpper(x));
    if (cells.some((x) => x.includes("PLATE")) && cells.some((x) => x === "DRIVER")) { hr = i; break; }
  }
  if (hr < 0) { errors.push({ batch_id: batchId, sheet_name: sheetName, row_index: null, severity: "warning", code: "no_register_header", message: "Register header not found" }); return; }
  const H = (grid[hr] || []).map((x) => normUpper(x));
  const col = (test) => H.findIndex((h) => h && test(h));
  const cMake = col((h) => h.includes("MAKE"));
  const cDriver = col((h) => h === "DRIVER");
  const cPhone = col((h) => h.includes("PHONE"));
  const cColour = col((h) => h.includes("COLOUR") || h.includes("COLOR"));
  const cChassis = col((h) => h.includes("CHASIS") || h.includes("CHASSIS"));
  const cEngine = col((h) => h.includes("ENGINE"));
  const cMileage = col((h) => h.includes("MILEAGE"));
  const cPlate = col((h) => h.includes("PLATE"));
  const cService = col((h) => h.includes("LAST SERVICE"));
  const cCond = col((h) => h.includes("CONDITION"));
  const cExpiry = col((h) => h.includes("EXPIRY"));
  const cInsurance = col((h) => h.includes("INSURANCE"));
  const cSuspension = col((h) => h.includes("SUSPENSION"));
  for (let i = hr + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const plate = normPlate(r[cPlate]);
    const make = norm(r[cMake]);
    if (!plate && !make) continue;
    out.push({
      batch_id: batchId, plate, make: make || null,
      driver_name: norm(r[cDriver]) || null, driver_phone: norm(r[cPhone]) || null,
      colour: norm(r[cColour]) || null, chassis_number: norm(r[cChassis]) || null,
      engine_number: norm(r[cEngine]) || null, mileage_km: toInt(r[cMileage]),
      last_service_km: toInt(r[cService]), licence_expiry: toDate(r[cExpiry]),
      insurance_type: norm(r[cInsurance]) || null, condition_notes: norm(r[cCond]) || null,
      suspension_note: norm(r[cSuspension]) || null,
    });
  }
}

function parseTripLogs(grid, hdr, batchId, sheetName, out, errors) {
  const { headerRow, map } = hdr;
  let lastDate = null;
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const d = toDate(r[map.date]);
    if (d) lastDate = d;
    const plate = normPlate(r[map.plate]);
    const start = toInt(r[map.start]);
    const end = toInt(r[map.end]);
    if (!plate || (start == null && end == null)) continue; // not a trip row
    out.push({
      batch_id: batchId, sheet_name: sheetName, row_index: i, log_date: lastDate,
      plate, driver_token: norm(r[map.driver]) || null,
      vehicle_make: map.make != null ? norm(r[map.make]) || null : null,
      start_km: start, end_km: end, route: norm(r[map.route]) || null,
      fuel_raw: map.fuel != null ? norm(r[map.fuel]) || null : null,
      distance_km: map.distance != null ? toInt(r[map.distance]) : null,
      charge_per_km: map.charge != null ? toNum(r[map.charge]) : null,
      total_amount: map.total != null ? toNum(r[map.total]) : null,
    });
    if (start != null && end != null && end < start) {
      errors.push({ batch_id: batchId, sheet_name: sheetName, row_index: i, severity: "warning", code: "odo_rollback", message: `End ${end} < start ${start} for ${plate}` });
    }
  }
}

function parseCharges(grid, hdr, batchId, sheetName, out) {
  const { headerRow, map } = hdr;
  for (let i = headerRow + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const plate = map.plate >= 0 ? normPlate(r[map.plate]) : null;
    const make = map.make >= 0 ? norm(r[map.make]) : null;
    if (!plate && !make) continue;
    const km = map.km >= 0 ? toNum(r[map.km]) : null;
    const charge = map.charge >= 0 ? toNum(r[map.charge]) : null;
    if (!plate && km == null && charge == null) continue;
    out.push({
      batch_id: batchId, sheet_name: sheetName, plate, vehicle_make: make || null,
      department: map.department >= 0 ? norm(r[map.department]) || null : null,
      km_travelled: km, charge_per_km: charge,
      total_amount: map.total >= 0 ? toNum(r[map.total]) : null,
      maintenance: map.maintenance >= 0 ? toNum(r[map.maintenance]) : null,
      amount_payable: map.payable >= 0 ? toNum(r[map.payable]) : null,
    });
  }
}
