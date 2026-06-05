// Best-effort field extraction from raw OCR text. OCR is fuzzy, so these are
// heuristics that prefill a form — the user always reviews before saving.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const validYMD = (y: number, mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2099;

/** Parse a single date-ish string into ISO yyyy-mm-dd (assumes day-first). */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m && validYMD(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  if (m && validYMD(+m[3], +m[2], +m[1])) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(20\d{2})/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo && validYMD(+m[3], mo, +m[1])) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`;
  }
  return null;
}

/** Every date found in the text, normalized and de-duplicated, ascending. */
function allDates(text: string): string[] {
  const re = /(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})|(?:\d{1,2}\s*[A-Za-z]{3,9}\.?\s*20\d{2})/g;
  const found = new Set<string>();
  for (const m of text.matchAll(re)) {
    const d = normalizeDate(m[0]);
    if (d) found.add(d);
  }
  return [...found].sort();
}

export interface FuelReceiptFields {
  litres?: string;
  total?: string;
  pricePerLitre?: string;
  station?: string;
  date?: string;
}

export function parseFuelReceipt(text: string): FuelReceiptFields {
  const out: FuelReceiptFields = {};
  const t = text;
  const clean = (s: string) => s.replace(/,/g, ".").trim();

  let m =
    t.match(/(?:litres?|liters?|volume|vol|qty|quantity)\D{0,6}(\d{1,3}(?:[.,]\d{1,2}))/i) ||
    t.match(/(\d{1,3}(?:[.,]\d{1,2}))\s*(?:l(?:it(?:re|er)s?)?|lt|ltr)\b/i);
  if (m) out.litres = clean(m[1]);

  m = t.match(/(?:grand\s*total|total\s*(?:due|amount|paid)?|amount\s*(?:due|paid)?)\D{0,8}(?:USD|US\$|\$|R|ZWL)?\s*(\d{1,4}(?:[.,]\d{2}))/i);
  if (m) out.total = clean(m[1]);

  m = t.match(/(?:price|rate|unit|@)\D{0,6}(\d{1,2}[.,]\d{2,4})/i);
  if (m) out.pricePerLitre = clean(m[1]);

  const litresN = out.litres ? parseFloat(out.litres) : NaN;
  const totalN = out.total ? parseFloat(out.total) : NaN;
  if (!out.pricePerLitre && isFinite(totalN) && isFinite(litresN) && litresN > 0) {
    const p = totalN / litresN;
    if (p > 0 && p < 100) out.pricePerLitre = p.toFixed(3);
  }
  if (!out.total && out.pricePerLitre && isFinite(litresN)) {
    const tt = parseFloat(out.pricePerLitre) * litresN;
    if (isFinite(tt) && tt > 0) out.total = tt.toFixed(2);
  }

  const brands = ["puma", "total", "zuva", "engen", "shell", "bp", "trek", "redan", "glow"];
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const brandLine = lines.find((l) => brands.some((b) => l.toLowerCase().includes(b)));
  if (brandLine) out.station = brandLine.slice(0, 60);
  else if (lines[0]) out.station = lines[0].slice(0, 60);

  const dates = allDates(t);
  if (dates.length) out.date = dates[dates.length - 1];

  return out;
}

export interface LicenceDiscFields {
  expires_at?: string;
  document_number?: string;
  plate?: string;
}

export function parseLicenceDisc(text: string): LicenceDiscFields {
  const out: LicenceDiscFields = {};
  const t = text;

  const exp = t.match(
    /(?:exp(?:iry|ires)?|valid\s*(?:until|to)?)\D{0,12}((?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})|(?:\d{1,2}\s*[A-Za-z]{3,9}\.?\s*20\d{2}))/i,
  );
  if (exp) {
    const d = normalizeDate(exp[1]);
    if (d) out.expires_at = d;
  }
  if (!out.expires_at) {
    const dates = allDates(t);
    if (dates.length) out.expires_at = dates[dates.length - 1]; // latest date = likely expiry
  }

  const plate = t.match(/\b([A-Z]{2,3})\s?-?\s?(\d{3,4})\b/);
  if (plate) out.plate = `${plate[1]} ${plate[2]}`;

  const dn = t.match(/\b(\d{6,})\b/);
  if (dn) out.document_number = dn[1];

  return out;
}
