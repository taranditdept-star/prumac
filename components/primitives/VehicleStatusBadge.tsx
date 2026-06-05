import type { VehicleStatus } from "@/types/domain";

const config: Record<VehicleStatus, { label: string; classes: string; dot: string }> = {
  available:      { label: "Available",      classes: "bg-emerald-50 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500" },
  on_trip:        { label: "On trip",        classes: "bg-sky-50 text-sky-700 border-sky-200",              dot: "bg-sky-500" },
  maintenance:    { label: "Maintenance",    classes: "bg-amber-50 text-amber-700 border-amber-200",        dot: "bg-amber-500" },
  workshop:       { label: "Workshop",       classes: "bg-rose-50 text-rose-700 border-rose-200",           dot: "bg-rose-500" },
  decommissioned: { label: "Decommissioned", classes: "bg-slate-100 text-slate-500 border-slate-200",       dot: "bg-slate-400" },
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  const { label, classes, dot } = config[status] ?? config.available;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
