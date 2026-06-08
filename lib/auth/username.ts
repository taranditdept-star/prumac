/**
 * The app logs users in with a username + password. Supabase Auth uses email
 * as the identifier, so a username maps to a synthetic, non-routable email
 * (`<username>@drivers.prumac.local`). Staff who already have a real email can
 * just type it (anything containing "@" is used as-is).
 */
export const DRIVER_EMAIL_DOMAIN = "drivers.prumac.local";

export function usernameToEmail(username: string): string {
  const s = (username ?? "").trim().toLowerCase();
  if (s.includes("@")) return s;
  return `${s}@${DRIVER_EMAIL_DOMAIN}`;
}
