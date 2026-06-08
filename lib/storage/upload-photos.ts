"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Upload photos straight from the browser to the `photos` storage bucket and
 * return their storage paths.
 *
 * Why this exists: streaming image bytes through a Server Action hits Next.js's
 * 1 MB `serverActions.bodySizeLimit` (and a hard ~4.5 MB request limit on
 * Vercel), which made accident/fault photo submissions fail with a page reload
 * and "Unable to complete previous action". Uploading direct to Storage keeps
 * the Server Action payload tiny — it only receives the resulting paths.
 *
 * The signed-in driver satisfies the `photos_insert_authenticated` storage RLS
 * policy. Paths are namespaced by `prefix` (e.g. "accident", "fault").
 */
export async function uploadPhotosToStorage(
  files: File[],
  prefix: string,
): Promise<string[]> {
  if (files.length === 0) return [];
  const supabase = createClient();
  const folder = crypto.randomUUID();
  const paths: string[] = [];

  for (const file of files) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${prefix}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
    if (error) {
      throw new Error(error.message || "Photo upload failed");
    }
    paths.push(path);
  }

  return paths;
}
