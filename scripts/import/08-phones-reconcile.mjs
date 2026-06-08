// 1) Backfill driver contact phones from the register (where missing).
// 2) Reconcile computed invoice charges vs the Excel charge blocks, PER VEHICLE
//    across the whole year — the decisive test of whether the per-km RATE is
//    right (ratio ~1.0) vs a rate bug (ratio ~2.0) vs just coverage differences.
import { pgClient, normUpper, normPlate } from "./lib.mjs";

function normPhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("0")) return "+263" + s.slice(1); // ZW local → E.164
  return s;
}

const c = await pgClient();
try {
  // ── 1) phone backfill ──────────────────────────────────────────────────
  const reg = (await c.query(
    "SELECT DISTINCT driver_name, driver_phone FROM import.stg_vehicles WHERE driver_name IS NOT NULL AND driver_phone IS NOT NULL")).rows;
  const drivers = (await c.query(
    "SELECT p.id, p.full_name, p.phone FROM app.profiles p JOIN app.drivers d ON d.profile_id=p.id")).rows;
  const byName = new Map(drivers.map((d) => [normUpper(d.full_name), d]));
  let phonesSet = 0;
  for (const r of reg) {
    const d = byName.get(normUpper(r.driver_name));
    if (!d || d.phone) continue; // only fill blanks
    const phone = normPhone(r.driver_phone);
    if (!phone) continue;
    const taken = (await c.query("SELECT 1 FROM app.profiles WHERE phone=$1 LIMIT 1", [phone])).rows.length > 0;
    if (taken) continue;
    await c.query("UPDATE app.profiles SET phone=$1 WHERE id=$2", [phone, d.id]);
    d.phone = phone; phonesSet++;
  }
  console.log(`Driver phones backfilled: ${phonesSet}`);

  // ── 2) per-vehicle reconciliation ──────────────────────────────────────
  const excel = (await c.query(`
    SELECT plate, round(sum(total_amount))::int excel_charge
      FROM import.stg_vehicle_charges
     WHERE plate ~ '^[A-Z]{2,3} ?[0-9]{3,6}$' AND total_amount BETWEEN 0 AND 100000
     GROUP BY plate`)).rows;
  const mine = (await c.query(`
    SELECT v.plate_number plate, round(sum(li.quantity*li.unit_amount))::int my_charge
      FROM app.invoice_line_items li
      JOIN app.trips t ON t.id=li.trip_id
      JOIN app.vehicles v ON v.id=t.vehicle_id
     WHERE li.line_type='trip'
     GROUP BY v.plate_number`)).rows;
  const myMap = new Map(mine.map((m) => [normPlate(m.plate), m.my_charge]));
  const rows = [];
  for (const e of excel) {
    const p = normPlate(e.plate);
    const my = myMap.get(p) ?? 0;
    rows.push({ plate: p, excel: e.excel_charge, mine: my, ratio: e.excel_charge ? +(my / e.excel_charge).toFixed(2) : null });
  }
  rows.sort((a, b) => (b.mine + b.excel) - (a.mine + a.excel));
  console.log("\nPer-vehicle: my invoiced charges vs Excel charge-block totals (year):");
  console.table(rows);
  const te = rows.reduce((s, r) => s + r.excel, 0), tm = rows.reduce((s, r) => s + r.mine, 0);
  console.log(`Totals — Excel: $${te.toLocaleString()} | mine: $${tm.toLocaleString()} | overall ratio: ${(tm/te).toFixed(2)}`);
  console.log("Interpretation: ratios near 1.0 = rate correct (gap is coverage); ~2.0 across the board = rate doubled.");
} finally {
  await c.end();
}
