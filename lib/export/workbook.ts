import * as XLSX from "xlsx";
import type { ExportColumn } from "./types";

/**
 * Builds an .xlsx from a dataset's columns. Values that come back as numbers
 * stay numeric in the sheet, so the office can sum a column of kilometres or
 * money without cleaning it up first — the whole point of exporting to Excel
 * rather than to a PDF.
 */
export function buildWorkbook<Row>(
  title: string,
  columns: ExportColumn<Row>[],
  rows: Row[],
): Buffer {
  const header = columns.map((c) => c.header);
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      return v === null || v === undefined ? "" : v;
    }),
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 2) }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };          // keep headers visible while scrolling
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: Math.max(0, columns.length - 1), r: rows.length },
    }),
  };

  const wb = XLSX.utils.book_new();
  // Excel rejects sheet names over 31 chars or containing : \ / ? * [ ]
  const sheetName = title.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Export";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Plain CSV, for anyone who would rather open it in something else. */
export function buildCsv<Row>(columns: ExportColumn<Row>[], rows: Row[]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [
    columns.map((c) => esc(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(",")),
  ].join("\r\n");
}
