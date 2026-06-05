import type { DriverRating, LeaveStatus } from "@/types/domain";

const RATING_STYLE: Record<DriverRating, { cls: string; label: string }> = {
  excellent: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Excellent" },
  good: { cls: "bg-sky-50 text-sky-700 border-sky-200", label: "Good" },
  fair: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Fair" },
  poor: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "Poor" },
};

export function RatingBadge({ rating }: { rating: DriverRating }) {
  const s = RATING_STYLE[rating];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </span>
  );
}

const LEAVE_STYLE: Record<LeaveStatus, { cls: string; label: string }> = {
  pending: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Pending" },
  approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved" },
  rejected: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "Rejected" },
  cancelled: { cls: "bg-ink-100 text-ink-500 border-ink-200", label: "Cancelled" },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const s = LEAVE_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
