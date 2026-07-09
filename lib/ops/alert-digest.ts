import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, emailConfigured, type EmailResult } from "@/lib/notifications/email";

interface AlertRow {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  raised_at: string;
}

export interface DigestResult extends EmailResult {
  recipients: number;
  alerts: number;
  skipped?: "no-config" | "no-alerts" | "no-recipients";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function timeAgo(iso: string, now: number): string {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function renderDigest(alerts: AlertRow[], now: number): string {
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const sorted = [...alerts].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  const counts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };
  const color = { critical: "#e11d48", warning: "#d97706", info: "#0284c7" } as const;

  const rows = sorted
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;vertical-align:top;">
          <span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:${color[a.severity] ?? "#64748b"};border-radius:6px;padding:2px 7px;">${a.severity}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;">
          <div style="font-weight:600;color:#0f172a;font-size:14px;">${esc(a.title)}</div>
          ${a.body ? `<div style="color:#64748b;font-size:12px;margin-top:2px;">${esc(a.body)}</div>` : ""}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;color:#94a3b8;font-size:12px;white-space:nowrap;vertical-align:top;">${timeAgo(a.raised_at, now)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:linear-gradient(135deg,#161a45,#4338ca);border-radius:16px 16px 0 0;padding:22px 24px;color:#fff;">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c7d2fe;font-weight:700;">PRUMAC Connect</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px;">${alerts.length} open alert${alerts.length === 1 ? "" : "s"} need attention</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">
          ${counts.critical} critical &middot; ${counts.warning} warning &middot; ${counts.info} info
        </div>
      </div>
      <div style="background:#fff;border:1px solid #e6e9f0;border-top:0;border-radius:0 0 16px 16px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
      <div style="color:#94a3b8;font-size:12px;margin-top:14px;text-align:center;">
        Open the dashboard to acknowledge or resolve these alerts. This is an automated daily summary from PRUMAC Connect.
      </div>
    </div>
  </body></html>`;
}

/**
 * Email a digest of unresolved alerts to every active manager/admin. Returns a
 * summary so callers/tests can see what happened. Skips cleanly when email
 * isn't configured, there are no alerts, or no manager has an email.
 */
export async function sendAlertDigest(): Promise<DigestResult> {
  if (!emailConfigured()) return { configured: false, sent: 0, failed: 0, recipients: 0, alerts: 0, skipped: "no-config" };

  const sb = createServiceClient();
  const { data: alerts } = await sb
    .schema("app")
    .from("alerts")
    .select("kind, severity, title, body, raised_at")
    .is("resolved_at", null)
    .order("raised_at", { ascending: false })
    .limit(200)
    .returns<AlertRow[]>();

  if (!alerts || alerts.length === 0) return { configured: true, sent: 0, failed: 0, recipients: 0, alerts: 0, skipped: "no-alerts" };

  const { data: mgrs } = await sb
    .schema("app")
    .from("profiles")
    .select("email")
    .in("role", ["fleet_manager", "admin"])
    .eq("is_active", true)
    .returns<{ email: string | null }[]>();

  const to = (mgrs ?? [])
    .map((m) => m.email)
    .filter((e): e is string => !!e && e.includes("@") && !e.endsWith(".local"));

  if (to.length === 0) return { configured: true, sent: 0, failed: 0, recipients: 0, alerts: alerts.length, skipped: "no-recipients" };

  const html = renderDigest(alerts, Date.now());
  const res = await sendEmail({
    to,
    subject: `PRUMAC — ${alerts.length} open alert${alerts.length === 1 ? "" : "s"}`,
    html,
  });
  return { ...res, recipients: to.length, alerts: alerts.length };
}
