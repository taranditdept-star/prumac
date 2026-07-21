"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

export type FinanceResult = { error: string } | { success: true };

interface LineInput { account_id: string; debit: number; credit: number; memo?: string | null }

/** Post a balanced double-entry journal. Total debits must equal total credits. */
export async function createJournalEntry(formData: FormData): Promise<FinanceResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const entry_date = String(formData.get("entry_date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) return { error: "Pick a valid date." };
  const memo = (formData.get("memo") as string | null)?.trim() || null;
  const reference = (formData.get("reference") as string | null)?.trim() || null;
  const subsidiary_id = (formData.get("subsidiary_id") as string | null) || null;

  let lines: LineInput[];
  try {
    lines = JSON.parse(String(formData.get("lines") || "[]"));
  } catch {
    return { error: "Could not read the journal lines." };
  }
  const clean = lines
    .map((l) => ({ account_id: l.account_id, debit: Math.max(0, Number(l.debit) || 0), credit: Math.max(0, Number(l.credit) || 0), memo: l.memo?.trim() || null }))
    .filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
  if (clean.length < 2) return { error: "A journal needs at least two lines." };
  if (clean.some((l) => l.debit > 0 && l.credit > 0)) return { error: "A line can be either a debit or a credit, not both." };

  const totalDr = clean.reduce((s, l) => s + l.debit, 0);
  const totalCr = clean.reduce((s, l) => s + l.credit, 0);
  if (Math.round((totalDr - totalCr) * 100) !== 0) {
    return { error: `Out of balance — debits ${totalDr.toFixed(2)} vs credits ${totalCr.toFixed(2)}.` };
  }

  const { data: entry, error: eErr } = await supabase
    .schema("app").from("journal_entries")
    .insert({ entry_date, memo, reference, subsidiary_id: subsidiary_id || null, source: "manual", created_by: profile.id })
    .select("id").single<{ id: string }>();
  if (eErr || !entry) return { error: eErr?.message ?? "Could not save the journal." };

  const { error: lErr } = await supabase.schema("app").from("journal_lines").insert(
    clean.map((l, i) => ({ entry_id: entry.id, account_id: l.account_id, debit: l.debit, credit: l.credit, memo: l.memo, sort_order: i })),
  );
  if (lErr) {
    await supabase.schema("app").from("journal_entries").delete().eq("id", entry.id);
    return { error: `Could not save the lines: ${lErr.message}` };
  }

  revalidatePath("/finance", "layout");
  return { success: true };
}

export async function deleteJournalEntry(id: string): Promise<FinanceResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase.schema("app").from("journal_entries").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/finance", "layout");
  return { success: true };
}

/** Create or update a chart-of-accounts account. */
export async function upsertAccount(formData: FormData): Promise<FinanceResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const id = (formData.get("id") as string | null) || null;
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const subtype = (formData.get("subtype") as string | null)?.trim() || null;
  const normal_balance = String(formData.get("normal_balance") || "").trim();
  const is_active = formData.get("is_active") !== "false";

  if (!code || !name) return { error: "Code and name are required." };
  if (!["asset", "liability", "equity", "income", "expense"].includes(type)) return { error: "Pick an account type." };
  if (!["debit", "credit"].includes(normal_balance)) return { error: "Pick a normal balance." };

  if (id) {
    const { error } = await supabase.schema("app").from("chart_of_accounts").update({ code, name, type, subtype, normal_balance, is_active }).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.schema("app").from("chart_of_accounts").insert({ code, name, type, subtype, normal_balance, is_active });
    if (error) return { error: error.message };
  }
  revalidatePath("/finance/accounts");
  return { success: true };
}
