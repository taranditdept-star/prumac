import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, roleDefaultPath } from "@/lib/auth/session";
import type { AppRole, ProfileRow } from "@/types/domain";

/**
 * Who is allowed to use the driver app.
 *
 * Being a driver is a fact about the person — a row in app.drivers — not their
 * role. The driver shell used to gate on role === "driver", so the moment
 * someone was made an administrator every driver screen silently bounced them
 * to /live: no error, no explanation, just the wrong app. A manager who takes a
 * vehicle out could therefore never log the trip they had just driven.
 *
 * The database already worked this way. app.role_is() grants an admin
 * everything a driver has, and app.current_driver_id() looks only at
 * app.drivers.profile_id — it never consults the role. Only the app disagreed.
 *
 * Deliberately NOT cached across requests: a driver row created by onboarding
 * or by the office must take effect on the very next navigation, not up to a
 * minute later. React cache() still dedupes it within a single render, so the
 * layout and the page share one query.
 */
export interface DriverRecord {
  id: string;
  licence_number: string;
  licence_country: string;
  is_active: boolean;
}

const DRIVER_COLS = "id, licence_number, licence_country, is_active";

/** The signed-in user's own driver record, or null if they do not drive. */
export const getMyDriver = cache(async (profileId: string): Promise<DriverRecord | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("app")
    .from("drivers")
    .select(DRIVER_COLS)
    .eq("profile_id", profileId)
    .maybeSingle<DriverRecord>();
  return data ?? null;
});

/**
 * Gate for the driver app: you get in if you drive, whatever your role.
 *
 * A driver with no driver row still gets in — they see the "your driver profile
 * is not set up yet" state. Redirecting them would loop, because
 * roleDefaultPath("driver") is /home, the page we would be redirecting from.
 */
export async function requireDriverAccess(): Promise<{
  profile: ProfileRow;
  driver: DriverRecord | null;
}> {
  const profile = await requireAuth();
  const driver = await getMyDriver(profile.id);
  if (!driver && profile.role !== "driver") {
    redirect(roleDefaultPath(profile.role as AppRole));
  }
  return { profile, driver };
}

/**
 * True when this person is acting on their OWN driving — starting a trip in a
 * vehicle they are about to drive, rather than dispatching one from the office.
 *
 * This is the distinction the odometer photo, the vehicle-use terms and the
 * daily checklist actually care about. Keying them off role === "driver" was
 * wrong in both directions: an administrator who drives skipped every control,
 * and an admin dispatching a trip *to themselves* skipped them too.
 */
export async function isDrivingSelf(profileId: string, driverId: string | null): Promise<boolean> {
  if (!driverId) return false;
  const mine = await getMyDriver(profileId);
  return mine != null && mine.id === driverId;
}
