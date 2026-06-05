type FaultSeverity = "low" | "medium" | "high" | "critical";
type AccidentSeverity = "minor" | "moderate" | "severe" | "fatal";

const fault: Record<FaultSeverity, { label: string; classes: string; dot: string }> = {
  low:      { label: "Low",      classes: "bg-sky-50 text-sky-700 border-sky-200",          dot: "bg-sky-500" },
  medium:   { label: "Medium",   classes: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  high:     { label: "High",     classes: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  critical: { label: "Critical", classes: "bg-rose-50 text-rose-700 border-rose-200",       dot: "bg-rose-500" },
};

const accident: Record<AccidentSeverity, { label: string; classes: string; dot: string }> = {
  minor:    { label: "Minor",    classes: "bg-sky-50 text-sky-700 border-sky-200",          dot: "bg-sky-500" },
  moderate: { label: "Moderate", classes: "bg-amber-50 text-amber-700 border-amber-200",    dot: "bg-amber-500" },
  severe:   { label: "Severe",   classes: "bg-rose-50 text-rose-700 border-rose-200",       dot: "bg-rose-500" },
  fatal:    { label: "Fatal",    classes: "bg-rose-100 text-rose-900 border-rose-300",      dot: "bg-rose-700" },
};

export function FaultSeverityBadge({ severity }: { severity: FaultSeverity }) {
  const c = fault[severity] ?? fault.low;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function AccidentSeverityBadge({ severity }: { severity: AccidentSeverity }) {
  const c = accident[severity] ?? accident.minor;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const faultStatusCfg: Record<string, { label: string; classes: string }> = {
  reported:     { label: "Reported",     classes: "bg-sky-50 text-sky-700 border-sky-200" },
  acknowledged: { label: "Acknowledged", classes: "bg-violet-50 text-violet-700 border-violet-200" },
  in_repair:    { label: "In repair",    classes: "bg-amber-50 text-amber-700 border-amber-200" },
  resolved:     { label: "Resolved",     classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  wont_fix:     { label: "Won’t fix",    classes: "bg-ink-100 text-ink-700 border-ink-200" },
};

export function FaultStatusBadge({ status }: { status: string }) {
  const c = faultStatusCfg[status] ?? faultStatusCfg.reported;
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}

const accidentStatusCfg: Record<string, { label: string; classes: string }> = {
  reported:      { label: "Reported",      classes: "bg-rose-50 text-rose-700 border-rose-200" },
  investigating: { label: "Investigating", classes: "bg-amber-50 text-amber-700 border-amber-200" },
  closed:        { label: "Closed",        classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function AccidentStatusBadge({ status }: { status: string }) {
  const c = accidentStatusCfg[status] ?? accidentStatusCfg.reported;
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${c.classes}`}>
      {c.label}
    </span>
  );
}
