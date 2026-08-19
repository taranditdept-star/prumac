"use client";

import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { RowMenu, type RowAction } from "./RowMenu";

/**
 * "Export" button for any list screen. It carries the page's current query
 * string through to the export route, so the download is the list you are
 * actually looking at — filtered, not the whole table.
 */
export function ExportMenu({
  dataset,
  label = "Export",
  extra,
}: {
  /** Key from lib/export/datasets.ts */
  dataset: string;
  label?: string;
  /** Filters the export needs that are not already in the URL. */
  extra?: Record<string, string | undefined>;
}) {
  const search = useSearchParams();

  const href = (format: "xlsx" | "pdf" | "csv") => {
    const p = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v);
    p.set("format", format);
    return `/export/${dataset}?${p.toString()}`;
  };

  const actions: RowAction[] = [
    { key: "xlsx", label: "Excel (.xlsx)", icon: <FileSpreadsheet className="h-4 w-4" />, href: href("xlsx"), hint: "Totals and filters ready" },
    { key: "pdf", label: "PDF", icon: <FileText className="h-4 w-4" />, href: href("pdf"), hint: "For printing or sending on" },
    { key: "csv", label: "CSV", icon: <Table2 className="h-4 w-4" />, href: href("csv"), separatorBefore: true },
  ];

  return (
    <RowMenu
      actions={actions}
      ariaLabel={`${label} options`}
      trigger={
        <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
          <Download className="h-4 w-4" />
          {label}
        </span>
      }
    />
  );
}
