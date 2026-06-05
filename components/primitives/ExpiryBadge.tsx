import { getExpiryUrgency, expiryLabel } from "@/lib/utils/expiry";
import type { ExpiryUrgency } from "@/types/domain";

const styles: Record<ExpiryUrgency, string> = {
  expired:  "bg-rose-50 text-rose-700 border-rose-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  ok:       "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface ExpiryBadgeProps {
  expiresAt: string;
  showDate?: boolean;
}

export function ExpiryBadge({ expiresAt, showDate = false }: ExpiryBadgeProps) {
  const urgency = getExpiryUrgency(expiresAt);
  const label = expiryLabel(expiresAt);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium ${styles[urgency]}`}
    >
      {label}
      {showDate && (
        <span className="opacity-60 ml-1">
          ({new Date(expiresAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })})
        </span>
      )}
    </span>
  );
}
