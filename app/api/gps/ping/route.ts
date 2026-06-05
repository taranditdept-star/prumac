import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/uuid";

const pingSchema = z.object({
  recorded_at: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed_kph: z.number().min(0).max(300).optional().nullable(),
  heading_deg: z.number().min(0).max(360).optional().nullable(),
  accuracy_m: z.number().min(0).optional().nullable(),
  altitude_m: z.number().optional().nullable(),
  battery_pct: z.number().int().min(0).max(100).optional().nullable(),
  is_buffered: z.boolean().optional(),
});

const bodySchema = z.object({
  trip_id: uuid(),
  pings: z.array(pingSchema).min(1).max(120),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The RPC enforces driver = trip.driver_id (or fleet_manager/admin) via app.role_is()
  const { data, error } = await supabase
    .schema("app")
    .rpc("fn_record_ping_batch", {
      p_trip_id: parsed.data.trip_id,
      p_pings: parsed.data.pings,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ recorded: data ?? 0 });
}
