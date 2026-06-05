import type { TripStatus } from "@/types/domain";

const config: Record<TripStatus, { label: string; classes: string; dot: string; pulse?: boolean }> = {
  planned:     { label: "Planned",     classes: "bg-ink-100 text-ink-700 border-ink-200",         dot: "bg-ink-400" },
  in_progress: { label: "In progress", classes: "bg-sky-50 text-sky-700 border-sky-200",          dot: "bg-sky-500", pulse: true },
  paused:      { label: "Paused",      classes: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  ended:       { label: "Ended",       classes: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  completed:   { label: "Completed",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  cancelled:   { label: "Cancelled",   classes: "bg-rose-50 text-rose-700 border-rose-200",       dot: "bg-rose-500" },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const { label, classes, dot, pulse } = config[status] ?? config.planned;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
