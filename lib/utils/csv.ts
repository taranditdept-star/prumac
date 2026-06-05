/**
 * Minimal CSV helpers. Quotes any cell containing comma, quote, newline.
 */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export function csvDocument(header: string[], rows: unknown[][]): string {
  const lines = [csvRow(header)];
  for (const r of rows) lines.push(csvRow(r));
  // Excel-friendly BOM so accented characters and £/€/$ render correctly
  return "﻿" + lines.join("\r\n") + "\r\n";
}
