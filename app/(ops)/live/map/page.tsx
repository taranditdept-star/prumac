import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LiveOpsCommandCenter } from "@/components/ops/LiveOpsCommandCenter";
import type { FleetPosition } from "@/components/ops/FleetMap";
import type { AlertRow } from "@/components/ops/AlertsPanel";

export const dynamic = "force-dynamic";

export default async function LiveMapPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [posRes, alertRes] = await Promise.all([
    supabase.schema("app").rpc("fn_live_driver_positions"),
    supabase
      .schema("app")
      .from("alerts")
      .select(
        "id, kind, severity, title, body, raised_at, acknowledged_at, resolved_at, vehicle_id",
      )
      .is("resolved_at", null)
      .order("raised_at", { ascending: false })
      .limit(50),
  ]);

  const initialPositions: FleetPosition[] = Array.isArray(posRes.data)
    ? (posRes.data as FleetPosition[])
    : [];
  const initialAlerts: AlertRow[] = (alertRes.data ?? []) as AlertRow[];

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN && process.env.NEXT_PUBLIC_MAPBOX_TOKEN !== "pk.placeholder"
      ? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      : null;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">
            Live Ops Centre
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Real-time fleet positions, live alerts and active trip monitoring
          </p>
        </div>
        <Link
          href="/live"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-ink-200 hover:border-orange-300 hover:bg-orange-50 text-ink-900 text-sm font-semibold transition-all"
        >
          <LayoutDashboard className="h-4 w-4 text-orange-600" />
          Dashboard view
        </Link>
      </div>

      <LiveOpsCommandCenter
        initialPositions={initialPositions}
        initialAlerts={initialAlerts}
        mapboxToken={mapboxToken}
      />
    </div>
  );
}
