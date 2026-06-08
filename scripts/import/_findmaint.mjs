import { pgClient } from "./lib.mjs";
const c = await pgClient();
// Search every raw cell for the maintenance-detail signatures from the image
const hits = await c.query(`
  SELECT s.sheet_name, r.row_index, r.cells
  FROM import.raw_rows r JOIN import.sheets s ON s.id=r.sheet_id
  WHERE r.cells::text ILIKE '%SUSPENSION REPAIR%'
     OR r.cells::text ILIKE '%SERVICE KIT%'
     OR r.cells::text ILIKE '%WHEEL ALIGNMENT%'
     OR (r.cells::text ILIKE '%DETAILS%' AND r.cells::text ILIKE '%AMOUNT%')
  ORDER BY s.sheet_name, r.row_index LIMIT 25`);
console.log("maintenance-detail hits:", hits.rows.length);
for (const h of hits.rows) {
  console.log(`\n[${h.sheet_name} r${h.row_index}]`, JSON.stringify(h.cells).slice(0, 260));
}
// Also: which sheets have an EXPENSES / DETAILS / MAINTENANCE area?
const exp = await c.query(`
  SELECT DISTINCT s.sheet_name FROM import.raw_rows r JOIN import.sheets s ON s.id=r.sheet_id
  WHERE r.cells::text ILIKE '%EXPENSES%' OR r.cells::text ILIKE '%"DETAILS"%'`);
console.log("\nsheets mentioning EXPENSES/DETAILS:", exp.rows.map(r=>r.sheet_name));
await c.end();
