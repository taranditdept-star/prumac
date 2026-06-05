import type { ReconciliationStatus } from "@/types/domain";

type AnyStatus = ReconciliationStatus | "pending";

const config: Record<AnyStatus, { label: string; classes: string; dot: string; pulse?: boolean }> = {
  pending:   { label: "Pending",   classes: "bg-ink-100 text-ink-700 border-ink-200",            dot: "bg-ink-400", pulse: true },
  accepted:  { label: "Accepted",  classes: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  warning:   { label: "Warning",   classes: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  flagged:   { label: "Flagged",   classes: "bg-rose-50 text-rose-700 border-rose-200",          dot: "bg-rose-500" },
  critical:  { label: "Critical",  classes: "bg-rose-100 text-rose-800 border-rose-300",         dot: "bg-rose-600", pulse: true },
};

export function ReconciliationBadge({ status }: { status: AnyStatus }) {
  const { label, classes, dot, pulse } = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
