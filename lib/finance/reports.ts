import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { ACC, type Account, type AccountType } from "./accounts";

type SB = Awaited<ReturnType<typeof createClient>>;
const app = (sb: SB) => sb.schema("app");
const mkey = (d: string | null) => (d ? d.slice(0, 7) : "");

// ── Period model ─────────────────────────────────────────────────────────────
export interface Period {
  start: string; // inclusive YYYY-MM-DD
  end: string; // exclusive YYYY-MM-DD
  months: string[]; // YYYY-MM list, ascending
  label: string;
}

export function resolvePeriod(sp: { year?: string; from?: string; to?: string }): Period {
  const isYm = (v?: string) => v && /^\d{4}-\d{2}$/.test(v);
  let startYm: string, endYm: string;
  if (isYm(sp.from) || isYm(sp.to)) {
    startYm = isYm(sp.from) ? sp.from! : sp.to!;
    endYm = isYm(sp.to) ? sp.to! : sp.from!;
    if (startYm > endYm) [startYm, endYm] = [endYm, startYm];
  } else if (sp.year && /^\d{4}$/.test(sp.year)) {
    startYm = `${sp.year}-01`;
    endYm = `${sp.year}-12`;
  } else {
    // default: trailing 12 months ending at the latest data month (Jul 2026)
    endYm = "2026-07";
    const [ey, em] = endYm.split("-").map(Number);
    let sy = ey - 1, sm = em + 1;
    if (sm > 12) { sm -= 12; sy += 1; }
    startYm = `${sy}-${String(sm).padStart(2, "0")}`;
  }
  const months: string[] = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  const start = `${startYm}-01`;
  let [ny, nm] = endYm.split("-").map(Number);
  if (++nm > 12) { nm = 1; ny++; }
  const end = `${ny}-${String(nm).padStart(2, "0")}-01`;
  const label = startYm === endYm ? monthLabel(startYm) : `${monthLabel(startYm)} – ${monthLabel(endYm)}`;
  return { start, end, months, label };
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

// ── Raw fetchers ─────────────────────────────────────────────────────────────
interface InvoiceRow { id: string; subsidiary_id: string; period_start: string; period_end: string; subtotal: number; maintenance_credit: number; total_due: number; amount_paid: number; balance_outstanding: number; status: string; issued_at: string | null; due_at: string | null; invoice_number: string; }
interface PaymentRow { amount: number; paid_at: string; method: string | null; invoice_id: string; }
interface FuelRow { total_cost: number; filled_at: string; }
interface MaintRow { total_amount: number; performed_at: string; is_routine_service: boolean; summary: string | null; vehicle_id: string; }
interface JournalLine { debit: number; credit: number; memo: string | null; entry_date: string; account_code: string; account_type: AccountType; account_name: string; entry_memo: string | null; reference: string | null; }

async function fetchInvoices(sb: SB): Promise<InvoiceRow[]> {
  const { data } = await app(sb).from("invoices").select("id, subsidiary_id, period_start, period_end, subtotal, maintenance_credit, total_due, amount_paid, balance_outstanding, status, issued_at, due_at, invoice_number").neq("status", "void").order("period_start").returns<InvoiceRow[]>();
  return data ?? [];
}
async function fetchPayments(sb: SB): Promise<PaymentRow[]> {
  const { data } = await app(sb).from("invoice_payments").select("amount, paid_at, method, invoice_id").returns<PaymentRow[]>();
  return data ?? [];
}
async function fetchFuel(sb: SB): Promise<FuelRow[]> {
  const { data } = await app(sb).from("fuel_logs").select("total_cost, filled_at").returns<FuelRow[]>();
  return data ?? [];
}
async function fetchMaintenance(sb: SB): Promise<MaintRow[]> {
  const { data } = await app(sb).from("service_records").select("total_amount, performed_at, is_routine_service, summary, vehicle_id").returns<MaintRow[]>();
  return data ?? [];
}
async function fetchJournalLines(sb: SB): Promise<JournalLine[]> {
  const { data } = await app(sb).from("journal_lines").select("debit, credit, memo, journal_entries!inner(entry_date, memo, reference), chart_of_accounts!inner(code, type, name)").returns<{ debit: number; credit: number; memo: string | null; journal_entries: { entry_date: string; memo: string | null; reference: string | null }; chart_of_accounts: { code: string; type: AccountType; name: string } }[]>();
  return (data ?? []).map((r) => ({ debit: Number(r.debit), credit: Number(r.credit), memo: r.memo, entry_date: r.journal_entries.entry_date, account_code: r.chart_of_accounts.code, account_type: r.chart_of_accounts.type, account_name: r.chart_of_accounts.name, entry_memo: r.journal_entries.memo, reference: r.journal_entries.reference }));
}
export async function fetchAccounts(sb: SB): Promise<Account[]> {
  const { data } = await app(sb).from("chart_of_accounts").select("*").order("type").order("sort_order").returns<Account[]>();
  return data ?? [];
}
async function fetchSubsidiaries(sb: SB) {
  const { data } = await app(sb).from("subsidiaries").select("id, name, code, country").order("name").returns<{ id: string; name: string; code: string; country: string }[]>();
  return data ?? [];
}
async function fetchDepreciation(sb: SB) {
  const { data } = await app(sb).rpc("fn_fleet_depreciation");
  const rows = (Array.isArray(data) ? data : []) as { book_value: number; accumulated_depreciation: number; purchase_cost: number }[];
  return { cost: sum(rows.map((r) => Number(r.purchase_cost || 0))), accum: sum(rows.map((r) => Number(r.accumulated_depreciation || 0))), nbv: sum(rows.map((r) => Number(r.book_value || 0))) };
}
async function fetchInventoryValue(sb: SB) {
  const { data } = await app(sb).from("parts").select("current_stock, unit_cost").returns<{ current_stock: number; unit_cost: number }[]>();
  const parts = sum((data ?? []).map((p) => Number(p.current_stock || 0) * Number(p.unit_cost || 0)));
  const { data: t } = await app(sb).from("tyres").select("cost").in("status", ["in_store", "spare"]).returns<{ cost: number | null }[]>();
  const tyres = sum((t ?? []).map((x) => Number(x.cost || 0)));
  return parts + tyres;
}

const sum = (a: number[]) => a.reduce((s, x) => s + (Number(x) || 0), 0);
const inPeriod = (d: string | null, p: Period) => !!d && d >= p.start && d < p.end;
const upTo = (d: string | null, end: string) => !!d && d < end;

// ── Journal helpers ──────────────────────────────────────────────────────────
function journalByType(lines: JournalLine[], type: AccountType, filter: (l: JournalLine) => boolean, normal: "debit" | "credit"): number {
  return lines.filter((l) => l.account_type === type && filter(l)).reduce((s, l) => s + (normal === "debit" ? l.debit - l.credit : l.credit - l.debit), 0);
}
function journalByCode(lines: JournalLine[], code: string, filter: (l: JournalLine) => boolean, normal: "debit" | "credit"): number {
  return lines.filter((l) => l.account_code === code && filter(l)).reduce((s, l) => s + (normal === "debit" ? l.debit - l.credit : l.credit - l.debit), 0);
}

// ── Profit & Loss ────────────────────────────────────────────────────────────
export interface PnlLine { code: string; name: string; amount: number; source: "operational" | "journal" | "mixed"; }
export interface Pnl {
  income: PnlLine[]; expenses: PnlLine[];
  totalIncome: number; totalExpense: number; netProfit: number; margin: number;
  trend: { month: string; label: string; revenue: number; expense: number; profit: number }[];
}
export async function getProfitAndLoss(sb: SB, p: Period): Promise<Pnl> {
  const [inv, fuel, maint, jl] = await Promise.all([fetchInvoices(sb), fetchFuel(sb), fetchMaintenance(sb), fetchJournalLines(sb)]);
  const revenue = sum(inv.filter((i) => inPeriod(i.period_start, p)).map((i) => Number(i.subtotal)));
  const fuelExp = sum(fuel.filter((f) => inPeriod(f.filled_at, p)).map((f) => Number(f.total_cost)));
  const maintExp = sum(maint.filter((m) => inPeriod(m.performed_at, p)).map((m) => Number(m.total_amount)));
  const jIn = (l: JournalLine) => inPeriod(l.entry_date, p);

  const income: PnlLine[] = [
    { code: ACC.REVENUE, name: "Transport / Trip Revenue", amount: revenue + journalByCode(jl, ACC.REVENUE, jIn, "credit"), source: "mixed" },
    { code: ACC.OTHER_INCOME, name: "Other Income", amount: journalByCode(jl, ACC.OTHER_INCOME, jIn, "credit"), source: "journal" },
  ];
  const expenses: PnlLine[] = [
    { code: ACC.FUEL, name: "Fuel", amount: fuelExp + journalByCode(jl, ACC.FUEL, jIn, "debit"), source: "mixed" },
    { code: ACC.MAINTENANCE, name: "Maintenance & Repairs", amount: maintExp + journalByCode(jl, ACC.MAINTENANCE, jIn, "debit"), source: "mixed" },
    { code: ACC.PARTS, name: "Parts & Tyres", amount: journalByCode(jl, ACC.PARTS, jIn, "debit"), source: "journal" },
    { code: ACC.SALARIES, name: "Salaries & Wages", amount: journalByCode(jl, ACC.SALARIES, jIn, "debit"), source: "journal" },
    { code: ACC.INSURANCE, name: "Insurance", amount: journalByCode(jl, ACC.INSURANCE, jIn, "debit"), source: "journal" },
    { code: ACC.LICENSING, name: "Licensing & Compliance", amount: journalByCode(jl, ACC.LICENSING, jIn, "debit"), source: "journal" },
    { code: ACC.DEPRECIATION, name: "Depreciation", amount: journalByCode(jl, ACC.DEPRECIATION, jIn, "debit"), source: "journal" },
    { code: ACC.ADMIN, name: "Administrative Expenses", amount: journalByCode(jl, ACC.ADMIN, jIn, "debit"), source: "journal" },
    { code: ACC.OTHER_EXPENSE, name: "Other Expenses", amount: journalByCode(jl, ACC.OTHER_EXPENSE, jIn, "debit"), source: "journal" },
  ];
  const totalIncome = sum(income.map((l) => l.amount));
  const totalExpense = sum(expenses.map((l) => l.amount));
  const netProfit = totalIncome - totalExpense;

  const trend = p.months.map((ym) => {
    const rev = sum(inv.filter((i) => mkey(i.period_start) === ym).map((i) => Number(i.subtotal))) + journalByCode(jl, ACC.REVENUE, (l) => mkey(l.entry_date) === ym, "credit") + journalByCode(jl, ACC.OTHER_INCOME, (l) => mkey(l.entry_date) === ym, "credit");
    const exp = sum(fuel.filter((f) => mkey(f.filled_at) === ym).map((f) => Number(f.total_cost))) + sum(maint.filter((m) => mkey(m.performed_at) === ym).map((m) => Number(m.total_amount))) + journalByType(jl, "expense", (l) => mkey(l.entry_date) === ym && l.account_code !== ACC.FUEL && l.account_code !== ACC.MAINTENANCE, "debit");
    return { month: ym, label: monthLabel(ym), revenue: Math.round(rev), expense: Math.round(exp), profit: Math.round(rev - exp) };
  });
  return { income, expenses, totalIncome, totalExpense, netProfit, margin: totalIncome ? (netProfit / totalIncome) * 100 : 0, trend };
}

// ── Balance Sheet (as at period.end) ─────────────────────────────────────────
export interface BsLine { code: string; name: string; amount: number; }
export interface BalanceSheet {
  asAt: string;
  assets: BsLine[]; liabilities: BsLine[]; equity: BsLine[];
  totalAssets: number; totalLiabilities: number; totalEquity: number;
}
export async function getBalanceSheet(sb: SB, p: Period): Promise<BalanceSheet> {
  const asAt = p.end; // exclusive upper bound
  const [inv, pay, fuel, maint, jl, dep, inventory] = await Promise.all([
    fetchInvoices(sb), fetchPayments(sb), fetchFuel(sb), fetchMaintenance(sb), fetchJournalLines(sb), fetchDepreciation(sb), fetchInventoryValue(sb),
  ]);
  // Receivable = each month's own net charge (subtotal − maintenance credit) up
  // to the date, less payments — NOT Σ balance_outstanding, which double-counts
  // the carried-forward previous balance.
  const netCharges = sum(inv.filter((i) => upTo(i.period_start, asAt)).map((i) => Number(i.subtotal) - Number(i.maintenance_credit)));
  const paymentsUpTo = sum(pay.filter((x) => upTo(x.paid_at, asAt)).map((x) => Number(x.amount)));
  const ar = netCharges - paymentsUpTo;
  const revenueAll = sum(inv.filter((i) => upTo(i.period_start, asAt)).map((i) => Number(i.subtotal)));
  const expenseAll = sum(fuel.filter((f) => upTo(f.filled_at, asAt)).map((f) => Number(f.total_cost))) + sum(maint.filter((m) => upTo(m.performed_at, asAt)).map((m) => Number(m.total_amount))) + journalByType(jl, "expense", (l) => upTo(l.entry_date, asAt), "debit");
  const otherIncomeAll = journalByCode(jl, ACC.OTHER_INCOME, (l) => upTo(l.entry_date, asAt), "credit");
  const paymentsAll = sum(pay.filter((x) => upTo(x.paid_at, asAt)).map((x) => Number(x.amount)));
  const cashExpense = sum(fuel.filter((f) => upTo(f.filled_at, asAt)).map((f) => Number(f.total_cost))) + sum(maint.filter((m) => upTo(m.performed_at, asAt)).map((m) => Number(m.total_amount)));
  const jUp = (l: JournalLine) => upTo(l.entry_date, asAt);
  const cash = paymentsAll - cashExpense + journalByCode(jl, ACC.CASH, jUp, "debit") + journalByCode(jl, ACC.CASH_ON_HAND, jUp, "debit");
  const retained = revenueAll + otherIncomeAll - expenseAll;

  const assets: BsLine[] = [
    { code: ACC.VEHICLES, name: "Motor Vehicles (net book value)", amount: dep.nbv + journalByCode(jl, ACC.VEHICLES, jUp, "debit") + journalByCode(jl, ACC.ACCUM_DEP, jUp, "debit") },
    { code: ACC.AR, name: "Accounts Receivable (Debtors)", amount: ar },
    { code: ACC.CASH, name: "Cash & Bank", amount: cash },
    { code: ACC.INVENTORY, name: "Inventory — Parts & Tyres", amount: inventory + journalByCode(jl, ACC.INVENTORY, jUp, "debit") },
  ];
  const liabilities: BsLine[] = [
    { code: ACC.AP, name: "Accounts Payable (Creditors)", amount: journalByCode(jl, ACC.AP, jUp, "credit") },
    { code: ACC.ACCRUALS, name: "Accrued Expenses", amount: journalByCode(jl, ACC.ACCRUALS, jUp, "credit") },
    { code: ACC.TAX, name: "VAT / Tax Payable", amount: journalByCode(jl, ACC.TAX, jUp, "credit") },
    { code: ACC.LOANS, name: "Loans Payable", amount: journalByCode(jl, ACC.LOANS, jUp, "credit") },
  ];
  const totalAssets = sum(assets.map((l) => l.amount));
  const totalLiabilities = sum(liabilities.map((l) => l.amount));
  const capital = journalByCode(jl, ACC.CAPITAL, jUp, "credit");
  const drawings = journalByCode(jl, ACC.DRAWINGS, jUp, "debit");
  const equityCore = capital - drawings + retained;
  const suspense = totalAssets - totalLiabilities - equityCore; // opening balances yet to be journalised
  const equity: BsLine[] = [
    { code: ACC.CAPITAL, name: "Owner's Capital", amount: capital },
    { code: ACC.RETAINED, name: "Retained Earnings (accumulated surplus)", amount: retained },
    { code: ACC.DRAWINGS, name: "Drawings", amount: -drawings },
    { code: "—", name: "Opening balances / to reconcile", amount: suspense },
  ];
  return { asAt, assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity: totalLiabilities + equityCore + suspense };
}

// ── Cashbook ─────────────────────────────────────────────────────────────────
export interface CashRow { date: string; description: string; type: "receipt" | "payment"; amount: number; category: string; }
export interface Cashbook { opening: number; rows: CashRow[]; totalReceipts: number; totalPayments: number; closing: number; }
export async function getCashbook(sb: SB, p: Period): Promise<Cashbook> {
  const [pay, fuel, maint, jl, inv] = await Promise.all([fetchPayments(sb), fetchFuel(sb), fetchMaintenance(sb), fetchJournalLines(sb), fetchInvoices(sb)]);
  const invNo = new Map(inv.map((i) => [i.id, i.invoice_number]));
  const before = (d: string | null) => !!d && d < p.start;
  const opening =
    sum(pay.filter((x) => before(x.paid_at)).map((x) => Number(x.amount)))
    - sum(fuel.filter((f) => before(f.filled_at)).map((f) => Number(f.total_cost)))
    - sum(maint.filter((m) => before(m.performed_at)).map((m) => Number(m.total_amount)))
    + journalByCode(jl, ACC.CASH, (l) => before(l.entry_date), "debit")
    + journalByCode(jl, ACC.CASH_ON_HAND, (l) => before(l.entry_date), "debit");

  const rows: CashRow[] = [];
  pay.filter((x) => inPeriod(x.paid_at, p)).forEach((x) => rows.push({ date: x.paid_at, description: `Payment received · ${invNo.get(x.invoice_id) ?? "invoice"}${x.method ? " · " + x.method : ""}`, type: "receipt", amount: Number(x.amount), category: "Receipts" }));
  fuel.filter((f) => inPeriod(f.filled_at, p)).forEach((f) => rows.push({ date: f.filled_at.slice(0, 10), description: "Fuel", type: "payment", amount: Number(f.total_cost), category: "Fuel" }));
  maint.filter((m) => inPeriod(m.performed_at, p)).forEach((m) => rows.push({ date: m.performed_at, description: `Maintenance · ${m.summary ?? "service"}`, type: "payment", amount: Number(m.total_amount), category: "Maintenance" }));
  jl.filter((l) => inPeriod(l.entry_date, p) && (l.account_code === ACC.CASH || l.account_code === ACC.CASH_ON_HAND)).forEach((l) => rows.push({ date: l.entry_date, description: l.entry_memo ?? l.memo ?? "Cash journal", type: l.debit > 0 ? "receipt" : "payment", amount: l.debit > 0 ? l.debit : l.credit, category: "Journal" }));
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const totalReceipts = sum(rows.filter((r) => r.type === "receipt").map((r) => r.amount));
  const totalPayments = sum(rows.filter((r) => r.type === "payment").map((r) => r.amount));
  return { opening, rows, totalReceipts, totalPayments, closing: opening + totalReceipts - totalPayments };
}

// ── Debtors + aging ──────────────────────────────────────────────────────────
export interface DebtorRow { subsidiary_id: string; name: string; code: string; current: number; d30: number; d60: number; d90: number; d90plus: number; total: number; }
export interface Debtors { rows: DebtorRow[]; totals: Omit<DebtorRow, "subsidiary_id" | "name" | "code">; asAt: string; }
export async function getDebtors(sb: SB, asAtDate: string): Promise<Debtors> {
  const [inv, pay, subs] = await Promise.all([fetchInvoices(sb), fetchPayments(sb), fetchSubsidiaries(sb)]);
  const asAt = new Date(`${asAtDate}T00:00:00Z`);
  const subByInvoice = new Map(inv.map((i) => [i.id, i.subsidiary_id]));
  const paidBySub = new Map<string, number>();
  for (const p of pay) { if (!upTo(p.paid_at, asAtDate)) continue; const sid = subByInvoice.get(p.invoice_id); if (sid) paidBySub.set(sid, (paidBySub.get(sid) ?? 0) + Number(p.amount)); }

  const bySub = new Map<string, DebtorRow>();
  subs.forEach((s) => bySub.set(s.id, { subsidiary_id: s.id, name: s.name, code: s.code, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 }));
  // Each invoice's OWN net charge for its month (subtotal − maintenance credit).
  // Carried "previous_balance" is bookkeeping only — excluded to avoid double count.
  const chargesBySub = new Map<string, { due: string; amount: number }[]>();
  for (const i of inv) {
    if (!upTo(i.period_start, asAtDate)) continue;
    const net = Number(i.subtotal) - Number(i.maintenance_credit);
    if (Math.round(net * 100) === 0) continue;
    const arr = chargesBySub.get(i.subsidiary_id) ?? [];
    arr.push({ due: i.due_at ?? i.period_end, amount: net });
    chargesBySub.set(i.subsidiary_id, arr);
  }
  for (const [sid, charges] of chargesBySub) {
    const row = bySub.get(sid); if (!row) continue;
    charges.sort((a, b) => (a.due < b.due ? -1 : 1));
    let paid = paidBySub.get(sid) ?? 0;             // allocate payments oldest-first
    for (const c of charges) { const use = Math.min(paid, c.amount); c.amount -= use; paid -= use; }
    for (const c of charges) {
      if (c.amount <= 0.005) continue;
      const ageDays = Math.floor((asAt.getTime() - new Date(`${c.due}T00:00:00Z`).getTime()) / 86400000);
      if (ageDays <= 0) row.current += c.amount;
      else if (ageDays <= 30) row.d30 += c.amount;
      else if (ageDays <= 60) row.d60 += c.amount;
      else if (ageDays <= 90) row.d90 += c.amount;
      else row.d90plus += c.amount;
      row.total += c.amount;
    }
  }
  const rows = [...bySub.values()].filter((r) => r.total > 0.5).sort((a, b) => b.total - a.total);
  const totals = rows.reduce((t, r) => ({ current: t.current + r.current, d30: t.d30 + r.d30, d60: t.d60 + r.d60, d90: t.d90 + r.d90, d90plus: t.d90plus + r.d90plus, total: t.total + r.total }), { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 });
  return { rows, totals, asAt: asAtDate };
}

// ── Creditors (from journal AP postings) ─────────────────────────────────────
export interface CreditorRow { name: string; amount: number; date: string; reference: string | null; }
export async function getCreditors(sb: SB, asAtDate: string): Promise<{ rows: CreditorRow[]; total: number }> {
  const jl = await fetchJournalLines(sb);
  const rows = jl.filter((l) => (l.account_code === ACC.AP || l.account_code === ACC.ACCRUALS || l.account_code === ACC.LOANS) && upTo(l.entry_date, `${asAtDate}T`) && l.credit - l.debit !== 0)
    .map((l) => ({ name: l.entry_memo ?? l.memo ?? l.account_name, amount: l.credit - l.debit, date: l.entry_date, reference: l.reference }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return { rows, total: sum(rows.map((r) => r.amount)) };
}

// ── Overview (dashboard) ─────────────────────────────────────────────────────
export interface Overview {
  revenue: number; expenses: number; netProfit: number; margin: number;
  receivables: number; cashReceipts: number; fleetNbv: number; overdue: number;
  trend: Pnl["trend"]; expenseBreakdown: { name: string; value: number; color: string }[];
  topDebtors: { name: string; amount: number }[];
}
export async function getOverview(sb: SB, p: Period): Promise<Overview> {
  const [pnl, debtors] = await Promise.all([getProfitAndLoss(sb, p), getDebtors(sb, p.end)]);
  const [pay, dep] = await Promise.all([fetchPayments(sb), fetchDepreciation(sb)]);
  const cashReceipts = sum(pay.filter((x) => inPeriod(x.paid_at, p)).map((x) => Number(x.amount)));
  const palette = ["#ff5a1f", "#f59e0b", "#8b5cf6", "#0ea5e9", "#10b981", "#ef4444", "#94a3b8"];
  const expenseBreakdown = pnl.expenses.filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount).map((e, i) => ({ name: e.name, value: Math.round(e.amount), color: palette[i % palette.length] }));
  return {
    revenue: pnl.totalIncome, expenses: pnl.totalExpense, netProfit: pnl.netProfit, margin: pnl.margin,
    receivables: debtors.totals.total, cashReceipts, fleetNbv: dep.nbv,
    overdue: debtors.totals.d30 + debtors.totals.d60 + debtors.totals.d90 + debtors.totals.d90plus,
    trend: pnl.trend, expenseBreakdown, topDebtors: debtors.rows.slice(0, 6).map((d) => ({ name: d.name, amount: d.total })),
  };
}
