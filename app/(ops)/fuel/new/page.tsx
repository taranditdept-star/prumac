import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { FuelLogForm } from "@/components/ops/FuelLogForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function NewFuelLogPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: vehicles }, { data: cards }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model, current_odometer_km")
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
        }[]
      >(),
    supabase
      .schema("app")
      .from("fuel_cards")
      .select("id, card_number, provider")
      .eq("is_active", true)
      .order("card_number")
      .returns<{ id: string; card_number: string; provider: string | null }[]>(),
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to fuel
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Log fuel</h1>
        <p className="text-sm text-ink-500 mt-1">
          Record a fill. Consumption is computed automatically between odometer readings.
        </p>
      </div>

      <FuelLogForm vehicles={vehicles ?? []} cards={cards ?? []} />
    </div>
  );
}
