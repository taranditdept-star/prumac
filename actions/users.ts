"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import { usernameToEmail } from "@/lib/auth/username";
import { staffCreateSchema, driverLoginCreateSchema } from "@/lib/validation/userAdmin";

export type UserActionResult =
  | { error: string }
  | { success: true; username?: string; password?: string };

// Unambiguous characters only (no 0/O/1/l/I) so spoken/typed passwords are safe.
function generatePassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function nextPmdId(service: ReturnType<typeof createServiceClient>): Promise<string> {
  const { data } = await service
    .schema("app")
    .from("drivers")
    .select("employee_number")
    .returns<{ employee_number: string | null }[]>();
  let max = 0;
  for (const r of data ?? []) {
    const m = /^PMD(\d+)$/.exec(r.employee_number ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PMD${String(max + 1).padStart(3, "0")}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Create a DRIVER login (auto PMD id + password). Licence stays IMPORT-PENDING
// so the driver completes it via the onboarding gate on first sign-in.
// ───────────────────────────────────────────────────────────────────────────
export async function createDriverLogin(formData: FormData): Promise<UserActionResult> {
  await requireRole("admin");
  const parsed = driverLoginCreateSchema.safeParse({
    full_name: formData.get("full_name"),
    subsidiary_id: formData.get("subsidiary_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const service = createServiceClient();
  const username = await nextPmdId(service);
  const password = generatePassword();
  const email = usernameToEmail(username);

  const { data: authRes, error: authErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !authRes.user) return { error: authErr?.message ?? "Failed to create login" };
  const uid = authRes.user.id;

  const { error: pErr } = await service.schema("app").from("profiles").upsert({
    id: uid,
    role: "driver",
    full_name: parsed.data.full_name,
    subsidiary_id: parsed.data.subsidiary_id ?? null,
  });
  if (pErr) {
    await service.auth.admin.deleteUser(uid);
    return { error: `Profile creation failed: ${pErr.message}` };
  }

  const { error: dErr } = await service.schema("app").from("drivers").insert({
    profile_id: uid,
    employee_number: username,
    licence_number: "IMPORT-PENDING",
    licence_country: "ZW",
    licence_classes: [],
    is_active: true,
  });
  if (dErr) {
    await service.auth.admin.deleteUser(uid);
    return { error: `Driver record creation failed: ${dErr.message}` };
  }

  revalidatePath("/admin/users");
  return { success: true, username, password };
}

// ───────────────────────────────────────────────────────────────────────────
// Create a STAFF login (manager / billing / admin) with a real email.
// ───────────────────────────────────────────────────────────────────────────
export async function createStaffLogin(formData: FormData): Promise<UserActionResult> {
  await requireRole("admin");
  const parsed = staffCreateSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role"),
    subsidiary_id: formData.get("subsidiary_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const service = createServiceClient();
  const password = generatePassword();

  const { data: authRes, error: authErr } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
  });
  if (authErr || !authRes.user) return { error: authErr?.message ?? "Failed to create login" };
  const uid = authRes.user.id;

  const { error: pErr } = await service.schema("app").from("profiles").upsert({
    id: uid,
    role: parsed.data.role,
    full_name: parsed.data.full_name,
    subsidiary_id: parsed.data.role === "subsidiary_billing" ? parsed.data.subsidiary_id ?? null : null,
  });
  if (pErr) {
    await service.auth.admin.deleteUser(uid);
    return { error: `Profile creation failed: ${pErr.message}` };
  }

  revalidatePath("/admin/users");
  return { success: true, username: parsed.data.email, password };
}

// ───────────────────────────────────────────────────────────────────────────
// Reset a user's password to a freshly generated one.
// ───────────────────────────────────────────────────────────────────────────
export async function resetUserPassword(profileId: string): Promise<UserActionResult> {
  await requireRole("admin");
  const service = createServiceClient();
  const password = generatePassword();

  const { error } = await service.auth.admin.updateUserById(profileId, { password });
  if (error) return { error: error.message };

  const { data: drv } = await service
    .schema("app")
    .from("drivers")
    .select("employee_number")
    .eq("profile_id", profileId)
    .maybeSingle<{ employee_number: string | null }>();
  const { data: prof } = await service
    .schema("app")
    .from("profiles")
    .select("email")
    .eq("id", profileId)
    .maybeSingle<{ email: string | null }>();

  return { success: true, username: drv?.employee_number ?? prof?.email ?? undefined, password };
}

// ───────────────────────────────────────────────────────────────────────────
// Activate / deactivate an account (bans the login + flips is_active flags).
// ───────────────────────────────────────────────────────────────────────────
export async function setUserActive(profileId: string, active: boolean): Promise<UserActionResult> {
  await requireRole("admin");
  const service = createServiceClient();

  const { error: banErr } = await service.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banErr) return { error: banErr.message };

  await service.schema("app").from("profiles").update({ is_active: active }).eq("id", profileId);
  await service.schema("app").from("drivers").update({ is_active: active }).eq("profile_id", profileId);

  revalidatePath("/admin/users");
  return { success: true };
}
