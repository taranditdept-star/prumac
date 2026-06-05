import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ServiceRecordForm } from "@/components/ops/ServiceRecordForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function NewServiceRecordPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: vehicles }, { data: subs }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model, current_odometer_km, default_subsidiary_id")
      .neq("status", "decommissioned")
      .order("plate_number")
      .returns<
        {
          id: string;
          plate_number: string;
          plate_country: CountryCode;
          make: string;
          model: string;
          current_odometer_km: number;
          default_subsidiary_id: string | null;
        }[]
      >(),
    supabase
      .schema("app")
      .from("subsidiaries")
      .select("id, name")
      .order("name")
      .returns<{ id: string; name: string }[]>(),
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href="/maintenance"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to maintenance
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Log service</h1>
        <p className="text-sm text-ink-500 mt-1">
          Record a service or repair. Reimbursable cost appears as a credit on the next invoice.
        </p>
      </div>

      <ServiceRecordForm vehicles={vehicles ?? []} subsidiaries={subs ?? []} />
    </div>
  );
}
