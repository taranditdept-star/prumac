import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { GenerateInvoiceForm } from "@/components/billing/GenerateInvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: subs } = await supabase
    .schema("app")
    .from("subsidiaries")
    .select("id, name")
    .order("name")
    .returns<{ id: string; name: string }[]>();

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">
          Generate invoice
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Pick a subsidiary and the billing period — the engine assembles the draft.
        </p>
      </div>

      <GenerateInvoiceForm subsidiaries={subs ?? []} />
    </div>
  );
}
