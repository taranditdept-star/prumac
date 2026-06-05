const cfg: Record<string, { label: string; classes: string; dot: string }> = {
  draft:          { label: "Draft",          classes: "bg-ink-100 text-ink-700 border-ink-200",            dot: "bg-ink-400" },
  issued:         { label: "Issued",         classes: "bg-sky-50 text-sky-700 border-sky-200",             dot: "bg-sky-500" },
  partially_paid: { label: "Partial",        classes: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  paid:           { label: "Paid",           classes: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  overdue:        { label: "Overdue",        classes: "bg-rose-50 text-rose-700 border-rose-200",          dot: "bg-rose-500" },
  void:           { label: "Void",           classes: "bg-ink-100 text-ink-500 border-ink-200 line-through", dot: "bg-ink-400" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const c = cfg[status] ?? cfg.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
