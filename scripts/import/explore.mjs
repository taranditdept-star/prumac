// Dump the workbook structure: sheet names, dims, and the first rows of each
// sheet so we can understand the real (and varying) layouts before parsing.
import xlsx from "xlsx";

const FILE = process.argv[2] || "E:/Downloads/PRUMAC VEHICLE REGISTER (2).xlsx";
const wb = xlsx.readFile(FILE, { cellDates: true });

console.log("WORKBOOK:", FILE);
console.log("SHEETS:", wb.SheetNames.length);
console.log(wb.SheetNames.map((n, i) => `  [${i}] ${n}`).join("\n"));

const HEAD_ROWS = Number(process.argv[3] || 10);
const MAX_COLS = 26;

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"] || "EMPTY";
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  console.log(`\n========== "${name}"  ref=${ref}  nonblank_rows=${rows.length} ==========`);
  for (let i = 0; i < Math.min(HEAD_ROWS, rows.length); i++) {
    const r = (rows[i] || []).slice(0, MAX_COLS).map((c) => {
      if (c === null || c === undefined) return "";
      if (c instanceof Date) return c.toISOString().slice(0, 10);
      return String(c).replace(/\s+/g, " ").slice(0, 16);
    });
    console.log(`r${String(i).padStart(2)}: ${JSON.stringify(r)}`);
  }
}
