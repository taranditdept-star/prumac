"use server";

import { requireRole } from "@/lib/auth/session";
import { sendAlertDigest, type DigestResult } from "@/lib/ops/alert-digest";
import { sendMonthlyReport, type MonthlyReportResult } from "@/lib/ops/monthly-report";

/** Send the alert digest email now (admin/manager) — for verifying SMTP setup. */
export async function sendTestDigest(): Promise<DigestResult> {
  await requireRole("fleet_manager", "admin");
  return sendAlertDigest();
}

/** Email the monthly report now (last calendar month) — admin/manager. */
export async function sendTestMonthlyReport(): Promise<MonthlyReportResult> {
  await requireRole("fleet_manager", "admin");
  return sendMonthlyReport();
}
