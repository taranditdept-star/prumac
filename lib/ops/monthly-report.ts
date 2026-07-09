import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, emailConfigured, type EmailResult } from "@/lib/notifications/email";

export interface MonthlyReportResult extends EmailResult {
  recipients: number;
  period: string;
  skipped?: "no-config" | "no-recipients";
}

interface Kpis {
  total_revenue: number;
  total_trips: number;
  total_km: number;
  utilisation_pct: number;
  outstanding_balance: number;
}
interface Cost {
  operating_cost: number;
  fuel_spend: number;
  maintenance_spend: number;
  cost_per_km: number | null;
}
interface TopVehicle {
  plate_number: string;
  make: string;
  model: string;
  km: number;
  revenue: number;
}

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function tile(label: string, value: string): string {
  return `<td style="padding:6px;"><div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;padding:14px;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;font-weight:700;">${label}</div>
    <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px;">${value}</div></div></td>`;
}

function render(period: string, k: Kpis, c: Cost, top: TopVehicle[]): string {
  const rows = top
    .map(
      (v, i) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;color:#94a3b8;font-weight:700;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;">
        <b style="color:#0f172a;">${esc(v.make)} ${esc(v.model)}</b>
        <span style="color:#64748b;font-size:12px;"> · ${esc(v.plate_number)}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;text-align:right;color:#0f172a;font-weight:700;">${money(v.revenue)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;text-align:right;color:#64748b;">${Number(v.km).toLocaleString()} km</td>
    </tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:660px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,#0b1220,#4338ca);border-radius:16px 16px 0 0;padding:24px;color:#fff;">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c7d2fe;font-weight:700;">PRUMAC Connect · Monthly report</div>
      <div style="font-size:24px;font-weight:800;margin-top:6px;">${period}</div>
    </div>
    <div style="background:#fff;border:1px solid #e6e9f0;border-top:0;padding:14px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        ${tile("Revenue billed", money(k.total_revenue))}
        ${tile("Trips", Number(k.total_trips).toLocaleString())}
        ${tile("Distance", `${(Number(k.total_km) / 1000).toFixed(1)}k km`)}
      </tr><tr>
        ${tile("Operating cost", money(c.operating_cost))}
        ${tile("Cost / km", c.cost_per_km != null ? `$${Number(c.cost_per_km).toFixed(2)}` : "—")}
        ${tile("Outstanding A/R", money(k.outstanding_balance))}
      </tr></table>
      ${
        rows
          ? `<div style="margin:16px 6px 4px;font-size:13px;font-weight:700;color:#0f172a;">Top earning vehicles</div>
             <table style="width:100%;border-collapse:collapse;margin:0 6px;">${rows}</table>`
          : ""
      }
    </div>
    <div style="color:#94a3b8;font-size:12px;margin-top:14px;text-align:center;">
      Automated monthly summary from PRUMAC Connect. Fuel figures reflect logged fuel-card fills.
    </div>
  </div></body></html>`;
}

/**
 * Email a one-page monthly summary (revenue, cost, top vehicles) to every
 * active manager/admin. Defaults to the previous calendar month.
 */
export async function sendMonthlyReport(opts?: { periodStart?: string; periodEnd?: string }): Promise<MonthlyReportResult> {
  if (!emailConfigured()) return { configured: false, sent: 0, failed: 0, recipients: 0, period: "", skipped: "no-config" };

  const now = new Date();
  const start = opts?.periodStart ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const end = opts?.periodEnd ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const period = new Date(start + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const sb = createServiceClient();
  const [kpiRes, costRes, vehRes] = await Promise.all([
    sb.schema("app").rpc("fn_fleet_kpis", { p_period_start: start, p_period_end: end }),
    sb.schema("app").rpc("fn_fleet_cost_summary", { p_start: start, p_end: end }),
    sb.schema("app").rpc("fn_top_vehicles", { p_limit: 5, p_period_start: start, p_period_end: end }),
  ]);

  const zeroK: Kpis = { total_revenue: 0, total_trips: 0, total_km: 0, utilisation_pct: 0, outstanding_balance: 0 };
  const zeroC: Cost = { operating_cost: 0, fuel_spend: 0, maintenance_spend: 0, cost_per_km: null };
  const k = (Array.isArray(kpiRes.data) && kpiRes.data[0] ? kpiRes.data[0] : zeroK) as Kpis;
  const c = (Array.isArray(costRes.data) && costRes.data[0] ? costRes.data[0] : zeroC) as Cost;
  const top = (Array.isArray(vehRes.data) ? vehRes.data : []) as TopVehicle[];

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
  if (to.length === 0) return { configured: true, sent: 0, failed: 0, recipients: 0, period, skipped: "no-recipients" };

  const res = await sendEmail({ to, subject: `PRUMAC monthly report — ${period}`, html: render(period, k, c, top) });
  return { ...res, recipients: to.length, period };
}
