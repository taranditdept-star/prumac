/**
 * Verdict labels/options — shared by the public report form, the admin panel and
 * the server. Deliberately NOT in lib/evidence/share.ts: that module is
 * `server-only` (node:crypto), so a client component importing from it fails the
 * build.
 */
export const VERDICT_LABELS: Record<string, string> = {
  driver_at_fault: "Driver at fault",
  not_driver_fault: "Driver not at fault",
  shared_fault: "Shared fault",
  inconclusive: "Inconclusive",
  needs_more_info: "Needs more information",
  disciplinary: "Recommend disciplinary action",
  insurance_claim: "Refer to insurance",
  no_further_action: "No further action",
};

export function verdictLabel(v: string): string {
  return VERDICT_LABELS[v] ?? v;
}

export const VERDICT_OPTIONS: { value: string; label: string }[] = Object.entries(VERDICT_LABELS).map(
  ([value, label]) => ({ value, label }),
);
