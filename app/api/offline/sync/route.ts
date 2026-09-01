import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

/**
 * Replays one piece of work a driver did with no signal.
 *
 * The queue retries, so this must be safe to call twice with the same
 * client_ref: a duplicate start returns the trip that already exists rather
 * than opening a second one. Times come from the phone, because a trip started
 * at 06:10 and synced at 11:40 must read 06:10 or every distance and duration
 * figure derived from it is wrong.
 *
 * The odometer photo cannot be queued — it is far too large for IndexedDB on a
 * cheap handset — so an offline start is accepted without one and marked
 * captured_offline for the office to see.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Item {
  client_ref: string;
  kind: "trip_start" | "trip_end" | "checklist" | "fault";
  captured_at: string;
  payload: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function POST(req: NextRequest) {
  const profile = await requireAuth();
  let item: Item;
  try {
    item = (await req.json()) as Item;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  if (!item?.client_ref || !item?.kind) {
    return NextResponse.json({ error: "Missing client_ref or kind" }, { status: 400 });
  }

  const supabase = await createClient();
  const app = supabase.schema("app");
  const capturedAt = str(item.captured_at) ?? new Date().toISOString();
  const p = item.payload ?? {};

  try {
    if (item.kind === "trip_start") {
      // Already synced? Say so and let the phone drop it.
      const { data: existing } = await app
        .from("trips").select("id").eq("client_ref", item.client_ref).maybeSingle<{ id: string }>();
      if (existing) return NextResponse.json({ ok: true, id: existing.id, duplicate: true });

      const vehicle_id = str(p.vehicle_id);
      const driver_id = str(p.driver_id);
      const start = num(p.start_odometer_km);
      if (!vehicle_id || !driver_id || start === null) {
        return NextResponse.json({ error: "Trip is missing vehicle, driver or odometer" }, { status: 400 });
      }

      const { data, error } = await app.from("trips").insert({
        client_ref: item.client_ref,
        captured_offline: true,
        vehicle_id,
        driver_id,
        subsidiary_id: str(p.subsidiary_id),
        purpose: str(p.purpose) ?? "delivery",
        purpose_detail: str(p.purpose_detail),
        route_description: str(p.route_description),
        origin_label: str(p.origin_label),
        destination_label: str(p.destination_label),
        start_odometer_km: start,
        status: "in_progress",
        started_at: capturedAt,
        created_by: profile.id,
      }).select("id").single<{ id: string }>();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (item.kind === "trip_end") {
      // The trip may have been started offline too, so accept either the server
      // id or the client_ref the phone generated when it started.
      let tripId = str(p.trip_id);
      if (!tripId && str(p.start_client_ref)) {
        const { data } = await app.from("trips").select("id, status")
          .eq("client_ref", str(p.start_client_ref)).maybeSingle<{ id: string; status: string }>();
        tripId = data?.id ?? null;
      }
      if (!tripId) return NextResponse.json({ error: "That trip is not on the server yet" }, { status: 409 });

      const { data: trip } = await app.from("trips").select("status")
        .eq("id", tripId).maybeSingle<{ status: string }>();
      if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 400 });
      // Already ended by an earlier replay — nothing to do.
      if (["ended", "completed"].includes(trip.status)) {
        return NextResponse.json({ ok: true, id: tripId, duplicate: true });
      }

      const end = num(p.end_odometer_km);
      if (end === null) return NextResponse.json({ error: "Missing closing odometer" }, { status: 400 });

      const { error } = await app.rpc("fn_end_trip", {
        p_trip_id: tripId,
        p_end_odometer: end,
        p_fuel_litres: num(p.fuel_litres),
        p_fuel_amount: num(p.fuel_amount),
        p_load_count: num(p.load_count),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await app.from("trips").update({ ended_at: capturedAt }).eq("id", tripId);
      return NextResponse.json({ ok: true, id: tripId });
    }

    if (item.kind === "fault") {
      const { data: existing } = await app
        .from("faults").select("id").eq("client_ref", item.client_ref).maybeSingle<{ id: string }>();
      if (existing) return NextResponse.json({ ok: true, id: existing.id, duplicate: true });

      const vehicle_id = str(p.vehicle_id);
      const title = str(p.title);
      if (!vehicle_id || !title) {
        return NextResponse.json({ error: "Fault needs a vehicle and a title" }, { status: 400 });
      }
      const { data, error } = await app.from("faults").insert({
        client_ref: item.client_ref,
        captured_offline: true,
        vehicle_id,
        title,
        description: str(p.description),
        category: str(p.category) ?? "other",
        severity: str(p.severity) ?? "low",
        odometer_km: num(p.odometer_km),
        status: "reported",
        reported_at: capturedAt,
        reported_by: profile.id,
      }).select("id").single<{ id: string }>();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (item.kind === "checklist") {
      const { data: existing } = await app
        .from("inspections").select("id").eq("client_ref", item.client_ref).maybeSingle<{ id: string }>();
      if (existing) return NextResponse.json({ ok: true, id: existing.id, duplicate: true });

      const vehicle_id = str(p.vehicle_id);
      if (!vehicle_id) return NextResponse.json({ error: "Checklist needs a vehicle" }, { status: 400 });

      const { data, error } = await app.from("inspections").insert({
        client_ref: item.client_ref,
        captured_offline: true,
        vehicle_id,
        driver_id: str(p.driver_id),
        trip_id: str(p.trip_id),
        template_id: str(p.template_id),
        type: str(p.type) ?? "pre_trip",
        overall_result: str(p.overall_result) ?? "pass",
        odometer_km: num(p.odometer_km),
        started_at: capturedAt,
        completed_at: capturedAt,
        overall_notes: str(p.notes),
      }).select("id").single<{ id: string }>();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      // Item-level answers, when the phone captured them.
      const answers = Array.isArray(p.answers) ? (p.answers as Record<string, unknown>[]) : [];
      if (answers.length > 0) {
        await app.from("inspection_item_results").insert(
          answers.map((a) => ({
            inspection_id: data.id,
            checklist_item_id: str(a.checklist_item_id),
            result: str(a.result) ?? "pass",
            notes: str(a.notes),
          })),
        );
      }
      return NextResponse.json({ ok: true, id: data.id });
    }

    return NextResponse.json({ error: `Unknown kind: ${item.kind}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}
