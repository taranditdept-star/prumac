"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/session";
import { getMyDriver } from "@/lib/auth/driver";
import { createClient } from "@/lib/supabase/server";
import { getOfficeFeed, getDriverFeed, type Audience, type Feed } from "@/lib/notifications/feed";

/**
 * Loaded when the bell is opened rather than on every page render — a
 * notification list nobody has opened is not worth a database round trip on
 * every single navigation, and the admin side was already making far too many.
 */
export async function loadNotifications(audience: Audience): Promise<Feed> {
  const profile = await requireAuth();

  if (audience === "office") {
    // Drivers must not be able to pull the whole fleet's alerts by asking for
    // the office feed: the audience comes from the client, so it is a request,
    // not a permission.
    if (profile.role === "driver") return { items: [], unread: 0 };
    return getOfficeFeed();
  }

  const driver = await getMyDriver(profile.id);
  return getDriverFeed(driver?.id ?? null);
}

/** Marks everything currently unread as seen. */
export async function markNotificationsRead(audience: Audience): Promise<{ ok: true }> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const now = new Date().toISOString();

  if (audience === "office") {
    if (profile.role === "driver") return { ok: true };
    await supabase
      .schema("app")
      .from("alerts")
      .update({ acknowledged_at: now, acknowledged_by: profile.id })
      .is("resolved_at", null)
      .is("acknowledged_at", null);
    revalidatePath("/live");
    return { ok: true };
  }

  const driver = await getMyDriver(profile.id);
  if (!driver) return { ok: true };
  // Only the driver's own alerts. Vehicle-wide ones belong to the office to
  // acknowledge — a driver clearing them would hide them from the people whose
  // job it is to act on them.
  await supabase
    .schema("app")
    .from("alerts")
    .update({ acknowledged_at: now, acknowledged_by: profile.id })
    .eq("driver_id", driver.id)
    .is("resolved_at", null)
    .is("acknowledged_at", null);
  revalidatePath("/home");
  return { ok: true };
}
