import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { VehicleForm } from "@/components/ops/VehicleForm";
import type { Database } from "@/types/database";

export default async function NewVehiclePage() {
  await requireRole("fleet_manager", "admin");

  const supabase = await createClient();
  const { data: subsidiaries } = await supabase
    .schema("app")
    .from("subsidiaries")
    .select("id, name")
    .order("name")
    .returns<Database["app"]["Tables"]["subsidiaries"]["Row"][]>();

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-ink-900 mb-1">Add vehicle</h1>
      <p className="text-sm text-muted-foreground mb-6">Register a new vehicle in the fleet</p>
      <VehicleForm subsidiaries={subsidiaries ?? []} />
    </div>
  );
}
