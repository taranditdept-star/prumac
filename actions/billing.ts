"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { uuid } from "@/lib/validation/uuid";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

const generateSchema = z.object({
  subsidiary_id: uuid(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
});

export async function generateInvoice(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");
  const parsed = generateSchema.safeParse({
    subsidiary_id: formData.get("subsidiary_id"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("fn_generate_invoice", {
    p_subsidiary_id: parsed.data.subsidiary_id,
    p_period_start: parsed.data.period_start,
    p_period_end: parsed.data.period_end,
    p_actor_id: profile.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/invoices");
  redirect(`/invoices/${data}`);
}

export async function issueInvoice(invoiceId: string): Promise<ActionResult> {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  // 30-day default term
  const due = new Date();
  due.setDate(due.getDate() + 30);

  const { error } = await supabase
    .schema("app")
    .from("invoices")
    .update({
      status: "issued",
      issued_at: new Date().toISOString().split("T")[0],
      due_at: due.toISOString().split("T")[0],
      issued_by: profile.id,
    })
    .eq("id", invoiceId)
    .eq("status", "draft");

  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function voidInvoice(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("admin");
  const invoiceId = formData.get("invoice_id") as string;
  const reason = (formData.get("reason") as string) ?? "";
  if (!invoiceId) return { error: "Invoice id required" };
  if (reason.length < 3) return { error: "Provide a reason for voiding" };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("invoices")
    .update({
      status: "void",
      voided_at: new Date().toISOString(),
      voided_by: profile.id,
      voided_reason: reason,
    })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

const paymentSchema = z.object({
  invoice_id: uuid(),
  amount: z.coerce.number().positive(),
  paid_at: z.string().min(1),
  method: z.string().max(40).nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
});

export async function recordPayment(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("admin");
  const parsed = paymentSchema.safeParse({
    invoice_id: formData.get("invoice_id"),
    amount: formData.get("amount"),
    paid_at: formData.get("paid_at"),
    method: formData.get("method") || null,
    reference: formData.get("reference") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  const { error: insErr } = await supabase
    .schema("app")
    .from("invoice_payments")
    .insert({
      invoice_id: parsed.data.invoice_id,
      amount: parsed.data.amount,
      paid_at: parsed.data.paid_at,
      method: parsed.data.method ?? null,
      reference: parsed.data.reference ?? null,
      recorded_by: profile.id,
    });
  if (insErr) return { error: insErr.message };

  // The invoice_payments_recalc trigger (0005_finance.sql) recomputes
  // amount_paid + status atomically within the insert — do NOT recompute here
  // (a JS read-sum-write races concurrent payments and clobbers the trigger).

  revalidatePath(`/invoices/${parsed.data.invoice_id}`);
  revalidatePath("/invoices");
  return { success: true };
}
