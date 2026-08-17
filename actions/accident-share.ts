"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import {
  newShareToken, newSharePassword, hashSharePassword, verifySharePassword,
  shareCookieName, signShareSession, readShareSession, MAX_ATTEMPTS, LOCK_MINUTES,
} from "@/lib/evidence/share";

export type ShareResult<T = void> = { error: string } | { success: true; data?: T };

/** Absolute base URL for the link we hand the admin. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://prumac.vercel.app").replace(/\/$/, "");
}

/**
 * Create a password-protected link to one accident report. ADMIN ONLY.
 * The password is generated here and returned ONCE — only its scrypt hash is
 * stored, so it can never be read back (same rule as driver logins).
 */
export async function createAccidentShare(
  accidentId: string,
  recipientLabel: string,
  allowVerdict = true,
): Promise<ShareResult<{ url: string; password: string; recipient: string }>> {
  const profile = await requireRole("admin");
  if (!accidentId) return { error: "Missing accident." };
  const recipient = recipientLabel.trim().slice(0, 120);
  if (recipient.length < 2) return { error: "Say who this link is for (e.g. CEO, HR, Committee)." };

  const service = createServiceClient();
  const { data: accident } = await service
    .schema("app")
    .from("accidents")
    .select("id")
    .eq("id", accidentId)
    .maybeSingle<{ id: string }>();
  if (!accident) return { error: "Accident not found." };

  const token = newShareToken();
  const password = newSharePassword();
  const { hash, salt } = hashSharePassword(password);

  const { error } = await service.schema("app").from("accident_shares").insert({
    accident_id: accidentId,
    token,
    password_hash: hash,
    password_salt: salt,
    recipient_label: recipient,
    allow_verdict: allowVerdict,
    created_by: profile.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${accidentId}`);
  return { success: true, data: { url: `${siteUrl()}/report/${token}`, password, recipient } };
}

/** Kill a link immediately. Links never expire on their own, so this is the off switch. */
export async function revokeAccidentShare(shareId: string): Promise<ShareResult> {
  await requireRole("admin");
  const service = createServiceClient();

  const { data: row } = await service
    .schema("app")
    .from("accident_shares")
    .select("accident_id")
    .eq("id", shareId)
    .maybeSingle<{ accident_id: string }>();
  if (!row) return { error: "That link no longer exists." };

  const { error } = await service
    .schema("app")
    .from("accident_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true };
}

/** Issue a fresh password for an existing link (the URL stays the same). */
export async function resetAccidentSharePassword(shareId: string): Promise<ShareResult<{ password: string }>> {
  await requireRole("admin");
  const service = createServiceClient();

  const { data: row } = await service
    .schema("app")
    .from("accident_shares")
    .select("accident_id")
    .eq("id", shareId)
    .maybeSingle<{ accident_id: string }>();
  if (!row) return { error: "That link no longer exists." };

  const password = newSharePassword();
  const { hash, salt } = hashSharePassword(password);
  const { error } = await service
    .schema("app")
    .from("accident_shares")
    .update({ password_hash: hash, password_salt: salt, failed_attempts: 0, locked_until: null })
    .eq("id", shareId);
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true, data: { password } };
}

// ───────────────────────────────────────────────────────────────────────────
// PUBLIC (anonymous) actions — the CEO/HR/committee side.
// No session exists here; the link token + password ARE the credential, so
// everything is validated server-side against the service client.
// ───────────────────────────────────────────────────────────────────────────

/** Verify the link password and open a short viewing session. */
export async function unlockAccidentShare(token: string, password: string): Promise<{ error: string } | { success: true }> {
  const t = (token ?? "").trim();
  const p = (password ?? "").trim();
  if (!t || !p) return { error: "Enter the password you were given." };

  const service = createServiceClient();
  const { data: share } = await service
    .schema("app")
    .from("accident_shares")
    .select("id, password_hash, password_salt, revoked_at, failed_attempts, locked_until")
    .eq("token", t)
    .maybeSingle<{
      id: string;
      password_hash: string;
      password_salt: string;
      revoked_at: string | null;
      failed_attempts: number;
      locked_until: string | null;
    }>();

  // Same message whether the link is unknown or the password is wrong — don't
  // help someone probe for valid links.
  const generic = { error: "That password isn't right for this link." };
  if (!share) return generic;
  if (share.revoked_at) return { error: "This link has been revoked. Ask the administrator for a new one." };
  if (share.locked_until && new Date(share.locked_until).getTime() > Date.now()) {
    return { error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.` };
  }

  if (!verifySharePassword(p, share.password_hash, share.password_salt)) {
    const attempts = (share.failed_attempts ?? 0) + 1;
    const lock = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await service
      .schema("app")
      .from("accident_shares")
      .update({ failed_attempts: lock ? 0 : attempts, locked_until: lock })
      .eq("id", share.id);
    return lock ? { error: `Too many wrong attempts. Try again in ${LOCK_MINUTES} minutes.` } : generic;
  }

  // Correct — clear the counter, record the view, set the session cookie.
  await service
    .schema("app")
    .from("accident_shares")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_viewed_at: new Date().toISOString(),
      view_count: (await currentViewCount(share.id)) + 1,
    })
    .eq("id", share.id);

  const { value, maxAge } = signShareSession(share.id);
  const store = await cookies();
  store.set(shareCookieName(t), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/report/${t}`,
    maxAge,
  });

  return { success: true };
}

async function currentViewCount(shareId: string): Promise<number> {
  const service = createServiceClient();
  const { data } = await service
    .schema("app")
    .from("accident_shares")
    .select("view_count")
    .eq("id", shareId)
    .maybeSingle<{ view_count: number }>();
  return data?.view_count ?? 0;
}

/** A viewer records their verdict + comment on the report. */
export async function submitAccidentVerdict(
  token: string,
  input: { author_name: string; author_role: string; verdict: string; comment: string },
): Promise<{ error: string } | { success: true }> {
  const t = (token ?? "").trim();
  const name = (input.author_name ?? "").trim().slice(0, 120);
  const role = (input.author_role ?? "").trim().slice(0, 60);
  const comment = (input.comment ?? "").trim().slice(0, 4000);
  if (!name) return { error: "Please give your name." };
  if (!input.verdict) return { error: "Choose a verdict." };

  const service = createServiceClient();
  const { data: share } = await service
    .schema("app")
    .from("accident_shares")
    .select("id, accident_id, revoked_at, allow_verdict")
    .eq("token", t)
    .maybeSingle<{ id: string; accident_id: string; revoked_at: string | null; allow_verdict: boolean }>();
  if (!share || share.revoked_at) return { error: "This link is no longer active." };
  if (!share.allow_verdict) return { error: "This link is view-only." };

  // Must hold a valid viewing session for THIS link — the password gate is the
  // only way to get one, so an anonymous POST can't slip a verdict in.
  const store = await cookies();
  if (!readShareSession(store.get(shareCookieName(t))?.value, share.id)) {
    return { error: "Your viewing session expired — please enter the password again." };
  }

  const { error } = await service.schema("app").from("accident_verdicts").insert({
    accident_id: share.accident_id,
    share_id: share.id,
    author_name: name,
    author_role: role || null,
    verdict: input.verdict,
    comment: comment || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${share.accident_id}`);
  revalidatePath(`/report/${t}`);
  return { success: true };
}
