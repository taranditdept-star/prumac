// Shared helpers for the PRUMAC Excel → Supabase import pipeline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadEnv() {
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

export async function pgClient() {
  loadEnv();
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

// ── value normalisers ──────────────────────────────────────────────────────
export const norm = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());
export const normUpper = (v) => norm(v).toUpperCase();

// Plate: collapse to "ABC 1234" style (uppercase, single space, strip junk).
export function normPlate(v) {
  const s = normUpper(v).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Insert a space between the letter group and number group if missing.
  const m = s.match(/^([A-Z]+)\s*([0-9]+)$/);
  return m ? `${m[1]} ${m[2]}` : s;
}

export function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v) {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

// Accept Date objects (cellDates) or assorted string formats → ISO yyyy-mm-dd.
export function toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// ── header detection ───────────────────────────────────────────────────────
const HEADER_TOKENS = {
  date: (h) => h === "DATE",
  plate: (h) => h.includes("PLATE"),
  driver: (h) => h === "DRIVER",
  make: (h) => h.includes("VEHICLE MAKE") || h === "MAKE",
  start: (h) => h.includes("STARTING"),
  end: (h) => h.includes("ENDING"),
  route: (h) => h.includes("ROUTE"),
  fuel: (h) => h === "FUEL",
  distance: (h) => h.includes("DISTANCE"),
  charge: (h) => h === "CHARGE",
  total: (h) => h.includes("TOTAL AMOUNT"),
};

/** Find the trip-log header row + a {field: colIndex} map. Returns null if absent. */
export function detectTripHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cells = (rows[i] || []).map((c) => normUpper(c));
    const hasDate = cells.some((c) => c === "DATE");
    const hasPlate = cells.some((c) => c.includes("PLATE"));
    const hasStart = cells.some((c) => c.includes("STARTING"));
    if (hasDate && hasPlate && hasStart) {
      const map = {};
      for (const [field, test] of Object.entries(HEADER_TOKENS)) {
        const idx = cells.findIndex((c) => c && test(c));
        if (idx >= 0) map[field] = idx;
      }
      return { headerRow: i, map };
    }
  }
  return null;
}

/** Find the right-side "VEHICLE CHARGES" sub-header row + column map. */
export function detectChargeHeader(rows) {
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] || []).map((c) => normUpper(c));
    const chargeIdx = cells.findIndex((c) => c.includes("CHRGE/KM") || c.includes("CHARGE/KM"));
    const payableIdx = cells.findIndex((c) => c.includes("AMOUNT PAYABLE"));
    if (chargeIdx >= 0 && payableIdx >= 0) {
      const find = (test) => cells.findIndex((c) => c && test(c));
      const map = {
        make: find((h) => h.startsWith("VEHICLE") && !h.includes("PLATE")),
        plate: find((h) => h.includes("PLATE")),
        km: find((h) => h.includes("TRAVE") || h.includes("DISTANCE")),
        charge: chargeIdx,
        total: find((h) => h.includes("TOTAL AMOUNT")),
        maintenance: find((h) => h.includes("MANTAIN") || h.includes("MAINTEN")),
        payable: payableIdx,
        department: find((h) => h.includes("DEPARTMENT")),
      };
      return { headerRow: i, map };
    }
  }
  return null;
}

// ── name matching ──────────────────────────────────────────────────────────
export function nameTokens(name) {
  return normUpper(name).replace(/[^A-Z ]/g, "").split(" ").filter((t) => t.length > 1);
}
