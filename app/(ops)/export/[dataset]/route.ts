import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { DATASETS } from "@/lib/export/datasets";
import { buildWorkbook, buildCsv } from "@/lib/export/workbook";
import { TablePdf } from "@/lib/export/TablePdf";
import { PDF_ROW_LIMIT, type ExportFormat } from "@/lib/export/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One route for every export: /export/<dataset>?format=xlsx|pdf|csv plus
 * whatever filters the screen was showing, so what you download matches what
 * you were looking at.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ dataset: string }> },
) {
  const { dataset: key } = await ctx.params;
  const dataset = DATASETS[key];
  if (!dataset) return NextResponse.json({ error: "Unknown export" }, { status: 404 });

  // Per-dataset roles: an accountant may pull invoices, not the fault log.
  await requireRole(...dataset.roles);

  const params = req.nextUrl.searchParams;
  const format = (params.get("format") ?? "xlsx") as ExportFormat;

  const supabase = await createClient();
  const { rows, error, subtitle } = await dataset.fetch(supabase, params);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `prumac-${dataset.key}-${stamp}`;
  const send = (body: Uint8Array | string, type: string, ext: string) =>
    new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${base}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });

  if (format === "pdf") {
    const capped = rows.length > PDF_ROW_LIMIT;
    const buf = await renderToBuffer(
      TablePdf({
        title: dataset.title,
        subtitle,
        columns: dataset.columns,
        rows: capped ? rows.slice(0, PDF_ROW_LIMIT) : rows,
        note: capped
          ? `Showing the first ${PDF_ROW_LIMIT.toLocaleString()} of ${rows.length.toLocaleString()} rows. Export to Excel for the complete list.`
          : undefined,
        orientation: dataset.orientation ?? "landscape",
        generatedAt: new Date().toLocaleString("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
        }),
      }),
    );
    return send(new Uint8Array(buf), "application/pdf", "pdf");
  }

  if (format === "csv") {
    return send(buildCsv(dataset.columns, rows), "text/csv; charset=utf-8", "csv");
  }

  const wb = buildWorkbook(dataset.title, dataset.columns, rows);
  return send(
    new Uint8Array(wb),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsx",
  );
}
