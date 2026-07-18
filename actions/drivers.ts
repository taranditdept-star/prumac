"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import {
  driverCreateSchema,
  driverUpdateSchema,
  driverAssignmentSchema,
} from "@/lib/validation/driver";
import { normalisePhone } from "@/lib/utils/phone";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

// ───────────────────────────────────────────────────────────────────────────
// CREATE driver
//
// Flow:
//   1. Create auth.users via service-role Admin API (gets user.id)
//   2. Bootstrap trigger creates app.profiles row
//   3. Update profile with role=driver, full_name, subsidiary_id
//   4. Insert app.drivers row tied to the profile
//
// Bypasses the BEFORE UPDATE trigger via session_replication_role = replica
// pattern is NOT available here; instead, we use the service client which is
// flagged in the role-guard trigger as exempt.
// ───────────────────────────────────────────────────────────────────────────
export async function createDriver(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireRole("fleet_manager", "admin");

  const raw = {
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    employee_number: formData.get("employee_number") || null,
    licence_number: formData.get("licence_number"),
    licence_country: formData.get("licence_country"),
    licence_classes: formData.getAll("licence_classes"),
    licence_issued_at: formData.get("licence_issued_at") || null,
    licence_expires_at: formData.get("licence_expires_at"),
    defensive_driving_cert_at: formData.get("defensive_driving_cert_at") || null,
    medical_cert_expires_at: formData.get("medical_cert_expires_at") || null,
    home_address: formData.get("home_address") || null,
    next_of_kin_name: formData.get("next_of_kin_name") || null,
    next_of_kin_phone: formData.get("next_of_kin_phone") || null,
    subsidiary_id: formData.get("subsidiary_id") || null,
  };

  const parsed = driverCreateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = parsed.data;
  const phone = normalisePhone(data.phone);
  const service = createServiceClient();

  // Step 1: create auth user via Admin API
  const { data: authResult, error: authError } = await service.auth.admin.createUser({
    email: data.email || undefined,
    phone,
    email_confirm: !!data.email,
    phone_confirm: true,
    user_metadata: { full_name: data.full_name },
  });

  if (authError || !authResult.user) {
    return { error: authError?.message ?? "Failed to create auth user" };
  }
  const userId = authResult.user.id;

  // Step 2: update profile with driver fields
  const { error: profileError } = await service
    .schema("app")
    .from("profiles")
    .upsert({
      id: userId,
      role: "driver",
      full_name: data.full_name,
      phone,
      subsidiary_id: data.subsidiary_id ?? null,
      // The new-user trigger stubs is_active=false; RLS role_is() needs it true
      // or the driver sees none of their own vehicle/assignment data. This
      // driver is fully formed (licence provided), so activate immediately.
      is_active: true,
    });

  if (profileError) {
    // Clean up the auth user if profile creation fails
    await service.auth.admin.deleteUser(userId);
    return { error: `Profile creation failed: ${profileError.message}` };
  }

  // Step 3: insert driver row
  const { data: driver, error: driverError } = await service
    .schema("app")
    .from("drivers")
    .insert({
      profile_id: userId,
      employee_number: data.employee_number ?? null,
      licence_number: data.licence_number,
      licence_country: data.licence_country,
      licence_classes: data.licence_classes,
      licence_issued_at: data.licence_issued_at ?? null,
      licence_expires_at: data.licence_expires_at,
      defensive_driving_cert_at: data.defensive_driving_cert_at ?? null,
      medical_cert_expires_at: data.medical_cert_expires_at ?? null,
      home_address: data.home_address ?? null,
      next_of_kin_name: data.next_of_kin_name ?? null,
      next_of_kin_phone: data.next_of_kin_phone ?? null,
      is_active: true,
      deactivated_reason: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (driverError) {
    await service.auth.admin.deleteUser(userId);
    return { error: `Driver creation failed: ${driverError.message}` };
  }

  revalidatePath("/drivers");
  redirect(`/drivers/${driver.id}`);
}

// ───────────────────────────────────────────────────────────────────────────
// UPDATE driver — non-credential fields only
// ───────────────────────────────────────────────────────────────────────────
export async function updateDriver(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");

  const raw: Record<string, unknown> = {
    id: formData.get("id"),
    full_name: formData.get("full_name") ?? undefined,
    employee_number: formData.get("employee_number") || null,
    licence_number: formData.get("licence_number") ?? undefined,
    licence_country: formData.get("licence_country") ?? undefined,
    licence_classes: formData.getAll("licence_classes"),
    licence_issued_at: formData.get("licence_issued_at") || null,
    licence_expires_at: formData.get("licence_expires_at") ?? undefined,
    defensive_driving_cert_at: formData.get("defensive_driving_cert_at") || null,
    medical_cert_expires_at: formData.get("medical_cert_expires_at") || null,
    home_address: formData.get("home_address") || null,
    next_of_kin_name: formData.get("next_of_kin_name") || null,
    next_of_kin_phone: formData.get("next_of_kin_phone") || null,
    subsidiary_id: formData.get("subsidiary_id") || null,
  };

  const parsed = driverUpdateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, full_name, subsidiary_id, ...driverFields } = parsed.data;
  const supabase = await createClient();

  // Update driver row (RLS allows fleet_manager/admin via drivers_write_managers)
  const { error: driverError } = await supabase
    .schema("app")
    .from("drivers")
    .update(driverFields)
    .eq("id", id);

  if (driverError) return { error: driverError.message };

  // Update profile name/subsidiary via service client (avoids the role-guard trigger)
  if (full_name !== undefined || subsidiary_id !== undefined) {
    const { data: driver } = await supabase
      .schema("app")
      .from("drivers")
      .select("profile_id")
      .eq("id", id)
      .single<{ profile_id: string }>();

    if (driver) {
      const service = createServiceClient();
      const update: Record<string, unknown> = {};
      if (full_name !== undefined) update.full_name = full_name;
      if (subsidiary_id !== undefined) update.subsidiary_id = subsidiary_id;
      await service.schema("app").from("profiles").update(update).eq("id", driver.profile_id);
    }
  }

  revalidatePath(`/drivers/${id}`);
  revalidatePath("/drivers");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// DELETE driver (admin only) — guarded.
//
// Only a driver with NO linked history can be hard-deleted (e.g. one added by
// mistake). ON DELETE RESTRICT foreign keys (trips, assignments, inspections,
// faults, accidents) make the row DELETE fail atomically with code 23503 when
// history exists. On success we also remove the linked auth user, which
// cascade-deletes the profile, so no orphan login remains.
// ───────────────────────────────────────────────────────────────────────────
export async function deleteDriver(driverId: string): Promise<ActionResult> {
  await requireRole("admin");
  const service = createServiceClient();

  const { data: driver } = await service
    .schema("app")
    .from("drivers")
    .select("profile_id")
    .eq("id", driverId)
    .maybeSingle<{ profile_id: string }>();

  const { error } = await service
    .schema("app")
    .from("drivers")
    .delete()
    .eq("id", driverId);

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This driver has trip, assignment or incident history. Deactivate them instead of deleting.",
      };
    }
    return { error: error.message };
  }

  // Remove the auth user (profiles.id REFERENCES auth.users ON DELETE CASCADE).
  if (driver?.profile_id) {
    const { error: authErr } = await service.auth.admin.deleteUser(driver.profile_id);
    if (authErr) {
      console.error("Driver row deleted but auth user removal failed:", authErr.message);
    }
  }

  revalidatePath("/drivers");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// DEACTIVATE driver
// ───────────────────────────────────────────────────────────────────────────
export async function deactivateDriver(driverId: string, reason: string): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("drivers")
    .update({ is_active: false, deactivated_reason: reason })
    .eq("id", driverId);
  if (error) return { error: error.message };

  // Close any open vehicle assignment
  await supabase
    .schema("app")
    .from("vehicle_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("driver_id", driverId)
    .is("ended_at", null);

  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// ASSIGN vehicle to driver
// ───────────────────────────────────────────────────────────────────────────
export async function assignVehicle(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = driverAssignmentSchema.safeParse({
    driver_id: formData.get("driver_id"),
    vehicle_id: formData.get("vehicle_id"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // End any active assignment on this vehicle
  await supabase
    .schema("app")
    .from("vehicle_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("vehicle_id", parsed.data.vehicle_id)
    .is("ended_at", null);

  // End any active assignment for this driver
  await supabase
    .schema("app")
    .from("vehicle_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("driver_id", parsed.data.driver_id)
    .is("ended_at", null);

  const { error } = await supabase
    .schema("app")
    .from("vehicle_assignments")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      driver_id: parsed.data.driver_id,
      assigned_by: profile.id,
      notes: parsed.data.notes ?? null,
    });

  if (error) {
    // Exclusion/unique conflict → a concurrent assignment beat us to it.
    if (error.code === "23P01" || error.code === "23505") {
      return { error: "That vehicle was just assigned to another driver — refresh and try again." };
    }
    return { error: error.message };
  }

  revalidatePath(`/drivers/${parsed.data.driver_id}`);
  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  revalidatePath("/drivers");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// END current assignment
// ───────────────────────────────────────────────────────────────────────────
export async function endAssignment(assignmentId: string): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { data: assignment, error: fetchError } = await supabase
    .schema("app")
    .from("vehicle_assignments")
    .select("driver_id, vehicle_id")
    .eq("id", assignmentId)
    .single<{ driver_id: string; vehicle_id: string }>();
  if (fetchError || !assignment) return { error: "Assignment not found" };

  const { error } = await supabase
    .schema("app")
    .from("vehicle_assignments")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath(`/drivers/${assignment.driver_id}`);
  revalidatePath(`/vehicles/${assignment.vehicle_id}`);
  return { success: true };
}
