import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { InvoicePdf } from "@/lib/pdf/invoice";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole("subsidiary_billing", "fleet_manager", "admin");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }] = await Promise.all([
    supabase
      .schema("app")
      .from("invoices")
      .select(`
        invoice_number, status, period_start, period_end, issued_at, due_at, currency,
        subtotal, maintenance_credit, previous_balance, total_due,
        amount_paid, balance_outstanding, notes,
        subsidiaries(name, code, country)
      `)
      .eq("id", id)
      .maybeSingle<{
        invoice_number: string;
        status: string;
        period_start: string;
        period_end: string;
        issued_at: string | null;
        due_at: string | null;
        currency: string;
        subtotal: number;
        maintenance_credit: number;
        previous_balance: number;
        total_due: number;
        amount_paid: number;
        balance_outstanding: number;
        notes: string | null;
        subsidiaries: { name: string; code: string; country: string } | null;
      }>(),
    supabase
      .schema("app")
      .from("invoice_line_items")
      .select("line_type, description, quantity, unit_amount, line_amount")
      .eq("invoice_id", id)
      .order("sort_order")
      .returns<{
        line_type: string;
        description: string;
        quantity: number;
        unit_amount: number;
        line_amount: number;
      }[]>(),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    InvoicePdf({
      data: {
        ...invoice,
        subsidiary: invoice.subsidiaries,
        lines: lines ?? [],
      },
    }),
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
