"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { uuid } from "@/lib/validation/uuid";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

/**
 * Recording a receipt against ONE invoice already existed, and in eight months
 * it was never used once — $1.35m sits outstanding with no payment on file.
 * The reason is that it does not match how money arrives: a subsidiary pays a
 * lump sum against whatever it owes, not invoice by invoice. Allocating
 * $40,000 by hand across thirty invoices is a job nobody will do.
 *
 * So a receipt is captured once, against the customer, and settled oldest
 * first — which is the convention the aged statement already assumes.
 */
const receiptSchema = z.object({
  subsidiary_id: uuid(),
  amount: z.coerce.number().positive("Enter the amount received"),
  paid_at: z.string().min(1, "When was it received?"),
  method: z.string().max(40).nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

interface OpenInvoice {
  id: string;
  invoice_number: string;
  due_at: string | null;
  issued_at: string | null;
  balance_outstanding: number;
}

export async function recordReceipt(
  formData: FormData,
): Promise<ActionResult<{ allocated: { invoice_number: string; amount: number }[]; unapplied: number }>> {
  const profile = await requireRole("admin", "fleet_manager");

  const parsed = receiptSchema.safeParse({
    subsidiary_id: formData.get("subsidiary_id"),
    amount: formData.get("amount"),
    paid_at: formData.get("paid_at"),
    method: formData.get("method") || null,
    reference: formData.get("reference") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();

  // Oldest first, and only invoices that are actually owed.
  const { data: open, error: readErr } = await supabase
    .schema("app")
    .from("invoices")
    .select("id, invoice_number, due_at, issued_at, balance_outstanding")
    .eq("subsidiary_id", d.subsidiary_id)
    .in("status", ["issued", "overdue"])
    .gt("balance_outstanding", 0)
    .order("due_at", { ascending: true, nullsFirst: false })
    .returns<OpenInvoice[]>();

  if (readErr) return { error: readErr.message };
  if (!open || open.length === 0) {
    return { error: "That customer has no unpaid invoices." };
  }

  // Work out the split before writing anything, so a rounding slip cannot
  // leave half a receipt applied.
  const cents = (n: number) => Math.round(n * 100);
  let remaining = cents(d.amount);
  const plan: { invoice: OpenInvoice; amount: number }[] = [];
  for (const inv of open) {
    if (remaining <= 0) break;
    const owed = cents(Number(inv.balance_outstanding));
    if (owed <= 0) continue;
    const take = Math.min(owed, remaining);
    plan.push({ invoice: inv, amount: take / 100 });
    remaining -= take;
  }

  if (plan.length === 0) return { error: "Nothing to allocate this receipt against." };

  // The invoice_payments_recalc trigger (0005_finance.sql) updates amount_paid
  // and the status on each invoice, so this only inserts.
  const { error: insErr } = await supabase
    .schema("app")
    .from("invoice_payments")
    .insert(
      plan.map((p) => ({
        invoice_id: p.invoice.id,
        amount: p.amount,
        paid_at: d.paid_at,
        method: d.method ?? null,
        reference: d.reference ?? null,
        recorded_by: profile.id,
        notes: d.notes ?? null,
      })),
    );
  if (insErr) return { error: insErr.message };

  revalidatePath("/invoices");
  revalidatePath("/finance/debtors");
  revalidatePath("/receipts");

  return {
    success: true,
    data: {
      allocated: plan.map((p) => ({ invoice_number: p.invoice.invoice_number, amount: p.amount })),
      // Money received beyond what is owed — flagged rather than swallowed, so
      // it can be checked against the deposit slip.
      unapplied: remaining / 100,
    },
  };
}
