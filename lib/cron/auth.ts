import "server-only";

/**
 * Verify a request came from Vercel Cron (or another trusted caller).
 *
 * Vercel attaches `Authorization: Bearer <CRON_SECRET>` to scheduled
 * invocations when the CRON_SECRET project env var is set. We fail closed: if
 * CRON_SECRET is missing or the header doesn't match, the request is rejected.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
