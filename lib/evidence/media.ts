import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { EVIDENCE_BUCKET, type MediaKind } from "@/lib/evidence/limits";

export interface EvidenceItem {
  id: string;
  kind: MediaKind;
  bucket: string;
  file_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  created_at: string;
  /** Short-lived signed URL, minted server-side. */
  url: string | null;
}

/** How long a media URL stays valid. Long enough to watch a clip, short enough to matter. */
const SIGNED_TTL_SECONDS = 60 * 60 * 4;

/**
 * Load an accident's evidence with signed URLs attached.
 *
 * Uses the SERVICE client because the public (password-verified) report page has
 * no Supabase session at all, and every storage policy is `TO authenticated`.
 * Callers are responsible for authorising the request first.
 */
export async function getAccidentEvidence(accidentId: string): Promise<EvidenceItem[]> {
  const service = createServiceClient();

  const { data: rows } = await service
    .schema("app")
    .from("accident_media")
    .select("id, kind, bucket, file_path, original_filename, mime_type, size_bytes, caption, created_at")
    .eq("accident_id", accidentId)
    .order("created_at", { ascending: true })
    .returns<Omit<EvidenceItem, "url">[]>();

  const items = rows ?? [];
  if (items.length === 0) return [];

  // Sign per bucket (media lives in 'evidence'; legacy rows could differ).
  const byBucket = new Map<string, Omit<EvidenceItem, "url">[]>();
  for (const it of items) {
    const b = it.bucket || EVIDENCE_BUCKET;
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(it);
  }

  const urlByPath = new Map<string, string>();
  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, list]) => {
      const { data } = await service.storage
        .from(bucket)
        .createSignedUrls(list.map((i) => i.file_path), SIGNED_TTL_SECONDS);
      for (const s of data ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(`${bucket}:${s.path}`, s.signedUrl);
      }
    }),
  );

  return items.map((it) => ({
    ...it,
    url: urlByPath.get(`${it.bucket || EVIDENCE_BUCKET}:${it.file_path}`) ?? null,
  }));
}

/**
 * The driver's own scene photos (app.accident_photos, the pre-existing table),
 * signed the same way so the report shows everything in one place.
 */
export async function getAccidentScenePhotos(accidentId: string): Promise<{ path: string; url: string | null }[]> {
  const service = createServiceClient();
  const { data } = await service
    .schema("app")
    .from("accident_photos")
    .select("file_path")
    .eq("accident_id", accidentId)
    .returns<{ file_path: string }[]>();

  const paths = (data ?? []).map((p) => p.file_path);
  if (paths.length === 0) return [];

  const { data: signed } = await service.storage.from("photos").createSignedUrls(paths, SIGNED_TTL_SECONDS);
  const map = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return paths.map((p) => ({ path: p, url: map.get(p) ?? null }));
}
