/**
 * Normalises raw phone input to E.164 format.
 * 077x/071x (ZW) → +263; 27x (SA) → +27.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("263")) return `+${digits}`;
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("07")) return `+263${digits.slice(1)}`;
  return `+${digits}`;
}
