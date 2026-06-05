import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TyreForm } from "@/components/ops/TyreForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function NewTyrePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: vehicles } = await supabase
    .schema("app")
    .from("vehicles")
    .select("id, plate_number, plate_country, make, model")
    .neq("status", "decommissioned")
    .order("plate_number")
    .returns<{ id: string; plate_number: string; plate_country: CountryCode; make: string; model: string }[]>();

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href="/tyres"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tyres
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Add tyre</h1>
        <p className="text-sm text-ink-500 mt-1">
          Register a tyre in the store or fit it directly to a vehicle position.
        </p>
      </div>

      <TyreForm vehicles={vehicles ?? []} />
    </div>
  );
}
