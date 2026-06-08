"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

export interface SearchHit {
  type: "vehicle" | "driver" | "trip" | "subsidiary";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

/**
 * Global search across the main entities, scoped by the caller's RLS.
 * Used by the top-bar search box on every ops/billing page.
 */
export async function searchEverything(qRaw: string): Promise<SearchHit[]> {
  await requireAuth();
  const q = (qRaw ?? "").trim();
  if (q.length < 2) return [];

  // Strip characters that would break a PostgREST or()/ilike filter.
  const safe = q.replace(/[,()%*]/g, " ").trim();
  if (!safe) return [];
  const like = `%${safe}%`;

  const supabase = await createClient();
  const hits: SearchHit[] = [];

  const [veh, drv, trp, sub] = await Promise.all([
    supabase.schema("app").from("vehicles")
      .select("id, plate_number, make, model")
      .or(`plate_number.ilike.${like},make.ilike.${like},model.ilike.${like}`)
      .order("plate_number").limit(6)
      .returns<{ id: string; plate_number: string; make: string; model: string }[]>(),
    supabase.schema("app").from("drivers")
      .select("id, is_active, profiles!inner(full_name)")
      .ilike("profiles.full_name", like).limit(6)
      .returns<{ id: string; is_active: boolean; profiles: { full_name: string | null } | null }[]>(),
    supabase.schema("app").from("trips")
      .select("id, route_description, started_at, vehicles(plate_number)")
      .ilike("route_description", like)
      .order("started_at", { ascending: false }).limit(6)
      .returns<{ id: string; route_description: string | null; started_at: string | null; vehicles: { plate_number: string } | null }[]>(),
    supabase.schema("app").from("subsidiaries")
      .select("id, name, code").ilike("name", like).limit(4)
      .returns<{ id: string; name: string; code: string }[]>(),
  ]);

  for (const v of veh.data ?? []) {
    hits.push({ type: "vehicle", id: v.id, label: v.plate_number, sublabel: `${v.make} ${v.model}`, href: `/vehicles/${v.id}` });
  }
  for (const d of drv.data ?? []) {
    hits.push({ type: "driver", id: d.id, label: d.profiles?.full_name ?? "Driver", sublabel: d.is_active ? "Driver" : "Inactive driver", href: `/drivers/${d.id}` });
  }
  for (const t of trp.data ?? []) {
    const when = t.started_at ? new Date(t.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
    hits.push({ type: "trip", id: t.id, label: t.route_description ?? "Trip", sublabel: [t.vehicles?.plate_number, when].filter(Boolean).join(" · "), href: `/trips/${t.id}` });
  }
  for (const s of sub.data ?? []) {
    hits.push({ type: "subsidiary", id: s.id, label: s.name, sublabel: s.code, href: `/subsidiaries/${s.id}` });
  }

  return hits;
}
