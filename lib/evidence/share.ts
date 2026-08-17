import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * Share-link crypto.
 *
 * No bcrypt/argon2 dependency exists in this project, so the link password is
 * hashed with node:crypto scrypt (memory-hard, in Node's stdlib) and compared in
 * constant time. The viewer's session is a short HMAC-signed cookie — there is
 * no jose/jsonwebtoken here either, and a signed cookie is all this needs.
 */

const SCRYPT_KEYLEN = 32;
const SESSION_TTL_SECONDS = 60 * 60 * 6; // a viewing session, not a login

/** Never falls back to a guessable value — a missing secret is a hard error. */
function secret(): string {
  const s = process.env.SHARE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SHARE_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set to sign share sessions");
  return s;
}

/** URL-safe opaque token for the link itself. */
export function newShareToken(): string {
  return randomBytes(18).toString("base64url"); // 24 chars, ~144 bits
}

/**
 * Human-dictatable password: no 0/O/1/l/I so it survives being read out on the
 * phone or typed from a WhatsApp message. Same alphabet as the driver logins.
 */
export function newSharePassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function hashSharePassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

/**
 * ASYNC on purpose: scrypt is memory-hard and scryptSync blocks the event loop
 * for tens of ms. An unauthenticated caller can hit the unlock endpoint in
 * parallel, so a synchronous hash would let them stall the whole server.
 */
export async function verifySharePassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const candidate = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, "hex");
    if (expected.length !== candidate.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ── viewer session cookie ───────────────────────────────────────────────────

export const SHARE_COOKIE_PREFIX = "prumac_share_";

/** One cookie per link, so opening a second report doesn't unlock the first. */
export function shareCookieName(token: string): string {
  // token is base64url (safe in a cookie name), but keep it short and sanitised.
  return SHARE_COOKIE_PREFIX + token.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

/**
 * The password VERSION is part of the signed payload, so issuing a new password
 * instantly invalidates sessions already open on the old one. Without it, the
 * "New password" button left a leaked-password holder inside for up to 6 hours.
 */
export function signShareSession(shareId: string, passwordVersion: number): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${shareId}.${passwordVersion}.${exp}`;
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { value: `${payload}.${mac}`, maxAge: SESSION_TTL_SECONDS };
}

/** True when the cookie proves current access to THIS share at THIS password version. */
export function readShareSession(
  cookieValue: string | undefined,
  expectShareId: string,
  expectPasswordVersion: number,
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return false;
  const [shareId, verStr, expStr, mac] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  if (shareId !== expectShareId) return false;
  if (Number(verStr) !== expectPasswordVersion) return false;

  const expected = createHmac("sha256", secret()).update(`${shareId}.${verStr}.${expStr}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── brute-force throttle ───────────────────────────────────────────────────

export const MAX_ATTEMPTS = 8;
export const LOCK_MINUTES = 15;

// Verdict labels/options live in lib/evidence/verdicts.ts — client components
// need them, and this module is server-only.
