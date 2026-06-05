import type { ExpiryUrgency } from "@/types/domain";

/**
 * Classifies a document expiry date into an urgency level.
 * - expired:  already past
 * - critical: within 14 days
 * - warning:  within 30 days
 * - ok:       more than 30 days away
 */
export function getExpiryUrgency(expiresAt: string, today = new Date()): ExpiryUrgency {
  const expiry = new Date(expiresAt);
  const diff = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "expired";
  if (diff <= 14) return "critical";
  if (diff <= 30) return "warning";
  return "ok";
}

export function expiryLabel(expiresAt: string, today = new Date()): string {
  const expiry = new Date(expiresAt);
  const diff = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return `Expired ${Math.abs(diff)}d ago`;
  if (diff === 0) return "Expires today";
  if (diff === 1) return "Expires tomorrow";
  return `${diff}d left`;
}

export const urgencyColor: Record<ExpiryUrgency, string> = {
  expired: "bg-[--crimson]/10 text-[--crimson] border-[--crimson]/20",
  critical: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-[--amber]/10 text-[--amber] border-[--amber]/20",
  ok: "bg-[--verdant]/10 text-[--verdant] border-[--verdant]/20",
};
