"use server";

import { requireRole } from "@/lib/auth/session";
import { sendAlertDigest, type DigestResult } from "@/lib/ops/alert-digest";

/** Send the alert digest email now (admin/manager) — for verifying SMTP setup. */
export async function sendTestDigest(): Promise<DigestResult> {
  await requireRole("fleet_manager", "admin");
  return sendAlertDigest();
}
