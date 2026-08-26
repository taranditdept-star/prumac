import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/ops/JobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { data: subs } = await supabase
    .schema("app")
    .from("subsidiaries")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .returns<{ id: string; name: string }[]>();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Dispatch
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Log a transport job</h1>
        <p className="mt-1 text-sm text-ink-500">
          Capture the request now and it stays linked through the quote, the trip and the invoice
        </p>
      </header>
      <JobForm subsidiaries={subs ?? []} />
    </div>
  );
}
