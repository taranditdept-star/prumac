import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

// Defaults mirror the previously hard-coded constants. Used when a key is
// missing or unparseable.
const DEFAULTS = {
  odometer_jump_threshold_km: 1500,
};

async function readAll(): Promise<Record<string, unknown>> {
  const sb = createServiceClient();
  const { data } = await sb
    .schema("app")
    .from("app_settings")
    .select("key, value")
    .returns<{ key: string; value: unknown }[]>();
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

/**
 * Cached settings for hot-path reads (e.g. every trip start). Up to 60s
 * propagation after an admin save is fine for thresholds.
 */
const cachedSettings = unstable_cache(readAll, ["app-settings"], { revalidate: 60 });

/** Uncached read — for the Settings page, so an admin sees their save at once. */
export async function getSettingsFresh(): Promise<Record<string, unknown>> {
  return readAll();
}

/** Implausible-jump threshold (km) for the start-odometer tamper check. */
export async function getOdometerJumpThreshold(): Promise<number> {
  const s = await cachedSettings();
  const v = Number(s.odometer_jump_threshold_km);
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS.odometer_jump_threshold_km;
}
