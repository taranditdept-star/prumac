"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import { EVIDENCE_BUCKET, MAX_UPLOAD_BYTES, kindForMime, type MediaKind } from "@/lib/evidence/limits";

export type EvidenceResult<T = void> = { error: string } | { success: true; data?: T };

interface AttachInput {
  accident_id: string;
  /** Storage path the browser already uploaded to (direct-to-storage). */
  file_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  caption?: string;
  duration_seconds?: number | null;
}

/**
 * Register a file the BROWSER has already uploaded to the evidence bucket.
 *
 * The bytes never pass through here — a Server Action body is capped around
 * 4.5 MB on Vercel, so a video or a long voice note has to go straight from the
 * browser to Storage. This records the metadata row afterwards.
 */
export async function attachAccidentMedia(input: AttachInput): Promise<EvidenceResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  if (!input.accident_id || !input.file_path) return { error: "Missing file details." };
  const kind: MediaKind | null = kindForMime(input.mime_type);
  if (!kind) return { error: "That file type isn't supported." };
  if (input.size_bytes > MAX_UPLOAD_BYTES) return { error: "That file is over the size limit." };
  // Guard against a client posting a path outside this accident's folder.
  if (!input.file_path.startsWith(`accident/${input.accident_id}/`)) {
    return { error: "Unexpected upload path." };
  }

  const service = createServiceClient();
  const { data: accident } = await service
    .schema("app")
    .from("accidents")
    .select("id")
    .eq("id", input.accident_id)
    .maybeSingle<{ id: string }>();
  if (!accident) return { error: "Accident not found." };

  const { data, error } = await service
    .schema("app")
    .from("accident_media")
    .insert({
      accident_id: input.accident_id,
      kind,
      bucket: EVIDENCE_BUCKET,
      file_path: input.file_path,
      original_filename: input.original_filename.slice(0, 200),
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      duration_seconds: input.duration_seconds ?? null,
      caption: input.caption?.trim() ? input.caption.trim().slice(0, 500) : null,
      uploaded_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  revalidatePath(`/accidents/${input.accident_id}`);
  return { success: true, data: { id: data.id } };
}

/** Remove an attachment (row + the stored file). Managers/admins. */
export async function deleteAccidentMedia(mediaId: string): Promise<EvidenceResult> {
  await requireRole("fleet_manager", "admin");
  const service = createServiceClient();

  const { data: row } = await service
    .schema("app")
    .from("accident_media")
    .select("id, accident_id, bucket, file_path")
    .eq("id", mediaId)
    .maybeSingle<{ id: string; accident_id: string; bucket: string; file_path: string }>();
  if (!row) return { error: "That attachment no longer exists." };

  const { error } = await service.schema("app").from("accident_media").delete().eq("id", mediaId);
  if (error) return { error: error.message };

  // Best effort — a stray object is harmless, a missing row is not.
  await service.storage.from(row.bucket || EVIDENCE_BUCKET).remove([row.file_path]);

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true };
}

/** Update just the caption on an attachment. */
export async function captionAccidentMedia(mediaId: string, caption: string): Promise<EvidenceResult> {
  await requireRole("fleet_manager", "admin");
  const service = createServiceClient();

  const { data: row } = await service
    .schema("app")
    .from("accident_media")
    .select("accident_id")
    .eq("id", mediaId)
    .maybeSingle<{ accident_id: string }>();
  if (!row) return { error: "That attachment no longer exists." };

  const { error } = await service
    .schema("app")
    .from("accident_media")
    .update({ caption: caption.trim() ? caption.trim().slice(0, 500) : null })
    .eq("id", mediaId);
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true };
}
