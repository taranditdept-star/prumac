import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { csvDocument } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
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
  subsidiaries: { name: string; code: string; country: string } | null;
}

export async function GET() {
  await requireRole("admin");
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("app")
    .from("invoices")
    .select(`
      id, invoice_number, status, period_start, period_end, issued_at, due_at, currency,
      subtotal, maintenance_credit, previous_balance, total_due,
      amount_paid, balance_outstanding,
      subsidiaries(name, code, country)
    `)
    .order("period_start", { ascending: false })
    .returns<Row[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => [
    r.invoice_number,
    r.status,
    r.subsidiaries?.code ?? "",
    r.subsidiaries?.name ?? "",
    r.subsidiaries?.country ?? "",
    r.period_start,
    r.period_end,
    r.issued_at ?? "",
    r.due_at ?? "",
    r.currency,
    Number(r.subtotal).toFixed(2),
    Number(r.maintenance_credit).toFixed(2),
    Number(r.previous_balance).toFixed(2),
    Number(r.total_due).toFixed(2),
    Number(r.amount_paid).toFixed(2),
    Number(r.balance_outstanding).toFixed(2),
  ]);

  const body = csvDocument(
    [
      "invoice_number", "status",
      "subsidiary_code", "subsidiary_name", "country",
      "period_start", "period_end", "issued_at", "due_at",
      "currency", "subtotal", "maintenance_credit", "previous_balance",
      "total_due", "amount_paid", "balance_outstanding",
    ],
    rows,
  );

  const filename = `prumac-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
