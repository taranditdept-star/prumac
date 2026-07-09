import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP email sender (provider-agnostic — works with Gmail app passwords,
 * SendGrid, Brevo, etc.). No-ops if SMTP env vars are absent so the rest of the
 * app keeps working. Server-side only.
 *
 * Env: SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, ALERT_EMAIL_FROM.
 */

let transporter: Transporter | null = null;
let configured: boolean | null = null;

function getTransporter(): Transporter | null {
  if (configured !== null) return transporter;
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) {
    configured = false;
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  try {
    transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    configured = true;
  } catch (e) {
    console.error("[email] transport config failed:", (e as Error)?.message);
    configured = false;
  }
  return transporter;
}

export function emailConfigured(): boolean {
  return getTransporter() !== null;
}

export interface EmailResult {
  configured: boolean;
  sent: number;
  failed: number;
}

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) return { configured: false, sent: 0, failed: 0 };
  const from = process.env.ALERT_EMAIL_FROM?.trim() || process.env.SMTP_USER!.trim();
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean);
  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    try {
      await t.sendMail({ from: `PRUMAC Connect <${from}>`, to, subject: opts.subject, html: opts.html });
      sent++;
    } catch (e) {
      failed++;
      console.error("[email] send failed to", to, (e as Error)?.message);
    }
  }
  return { configured: true, sent, failed };
}
