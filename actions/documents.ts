"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { documentSchema, documentUpdateSchema } from "@/lib/validation/document";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

/** Create or replace an active document for a vehicle.
 *  Deactivates any existing active document of the same type first. */
export async function upsertDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  const raw = {
    vehicle_id: formData.get("vehicle_id"),
    document_type: formData.get("document_type"),
    insurance_type: formData.get("insurance_type") || null,
    document_number: formData.get("document_number") || null,
    issuer: formData.get("issuer") || null,
    issued_at: formData.get("issued_at") || null,
    expires_at: formData.get("expires_at"),
    policy_amount: formData.get("policy_amount") ? Number(formData.get("policy_amount")) : null,
    notes: formData.get("notes") || null,
  };

  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Retire the current active document of this type
  await supabase
    .schema("app")
    .from("vehicle_documents")
    .update({ is_active: false })
    .eq("vehicle_id", parsed.data.vehicle_id)
    .eq("document_type", parsed.data.document_type)
    .eq("is_active", true);

  const { data, error } = await supabase
    .schema("app")
    .from("vehicle_documents")
    .insert({ ...parsed.data, is_active: true, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  return { success: true, data: { id: data.id } };
}

/** Upload a document file to Supabase Storage and attach the path to the document row. */
export async function uploadDocumentFile(
  documentId: string,
  vehicleId: string,
  file: File,
): Promise<ActionResult<{ publicUrl: string }>> {
  await requireRole("fleet_manager", "admin");

  const ext = file.name.split(".").pop() ?? "pdf";
  const storagePath = `vehicle-documents/${vehicleId}/${documentId}.${ext}`;

  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .schema("app")
    .from("vehicle_documents")
    .update({ file_path: storagePath })
    .eq("id", documentId);

  if (updateError) return { error: updateError.message };

  const { data } = supabase.storage.from("documents").getPublicUrl(storagePath);

  revalidatePath(`/vehicles/${vehicleId}`);
  return { success: true, data: { publicUrl: data.publicUrl } };
}

/** Delete (deactivate) a document. */
export async function deactivateDocument(
  documentId: string,
  vehicleId: string,
): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("vehicle_documents")
    .update({ is_active: false })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(`/vehicles/${vehicleId}`);
  return { success: true };
}
