import type { AppRole } from "@/types/domain";

/**
 * One description of a list, used to produce both the Excel workbook and the
 * PDF. Adding a new export means adding one entry to the registry — not a new
 * route, a new component and two new formatters.
 */
export interface ExportColumn<Row> {
  header: string;
  /** Cell value. Return a number for anything that should stay numeric in Excel. */
  value: (row: Row) => string | number | null;
  /** Column width in characters, for the spreadsheet. */
  width?: number;
  /** Right-align in the PDF — use for figures. */
  numeric?: boolean;
}

export interface ExportDataset<Row = Record<string, unknown>> {
  key: string;
  /** Shown as the PDF heading and the sheet name. */
  title: string;
  /** Who may download it. */
  roles: AppRole[];
  /** Reads the rows, honouring whatever filters the screen was showing. */
  /** `supabase` is the request-scoped server client from lib/supabase/server. */
  fetch: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    params: URLSearchParams,
  ) => Promise<{ rows: Row[]; error?: string; subtitle?: string }>;
  columns: ExportColumn<Row>[];
  /** Landscape suits wide tables; portrait reads better for short ones. */
  orientation?: "portrait" | "landscape";
}

/** Cap so a stray export cannot try to stream the whole history into memory. */
export const EXPORT_LIMIT = 20_000;

/**
 * A PDF is laid out row by row, and the renderer is slow: 1000 wide rows took
 * two minutes on the server, which is far too long to leave someone waiting on
 * a download. 500 keeps it responsive and is already ~20 pages — beyond that
 * nobody is printing it anyway.
 *
 * Excel and CSV stay uncapped; they are the right tool for bulk. When the PDF
 * is cut it says so on the page, because nobody checks a report for the rows
 * that are not there.
 */
export const PDF_ROW_LIMIT = 500;

export type ExportFormat = "xlsx" | "pdf" | "csv";
