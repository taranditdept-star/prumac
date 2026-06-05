import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriverForm } from "@/components/ops/DriverForm";

export const dynamic = "force-dynamic";

export default async function NewDriverPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: subs } = await supabase
    .schema("app")
    .from("subsidiaries")
    .select("id, name")
    .order("name")
    .returns<{ id: string; name: string }[]>();

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to drivers
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Add driver</h1>
        <p className="text-sm text-ink-500 mt-1">
          Create a new driver account. They will receive their login via phone OTP.
        </p>
      </div>

      <DriverForm subsidiaries={subs ?? []} />
    </div>
  );
}
