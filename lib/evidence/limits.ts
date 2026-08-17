/**
 * Evidence upload rules — shared by the browser uploader and the server action.
 *
 * MAX_UPLOAD_BYTES mirrors the LIVE project ceiling, measured against this
 * Supabase project: a 40 MB video uploads, 60 MB is refused with "The object
 * exceeded the maximum allowed size". Raising it means raising the project
 * storage limit in the Supabase dashboard first (paid plan), then this constant
 * and the bucket's file_size_limit together.
 */
export const EVIDENCE_BUCKET = "evidence";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type MediaKind = "photo" | "video" | "audio" | "document";

/** Exactly what the evidence bucket accepts (migration 0063). */
const ALLOWED: Record<MediaKind, string[]> = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/3gpp", "video/mpeg"],
  audio: [
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav",
    "audio/webm", "audio/x-m4a", "audio/3gpp", "audio/flac",
  ],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ],
};

export const ALL_ALLOWED_MIME = Object.values(ALLOWED).flat();

/** The `accept` attribute for a file input. */
export const ACCEPT_ATTR = ALL_ALLOWED_MIME.join(",");

export function kindForMime(mime: string): MediaKind | null {
  const m = (mime || "").toLowerCase();
  for (const [kind, list] of Object.entries(ALLOWED)) {
    if (list.includes(m)) return kind as MediaKind;
  }
  // Some phones report an empty or odd subtype — fall back to the top-level type.
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return null;
}

export function humanSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Returns a human-readable reason the file can't be uploaded, or null if it's fine. */
export function rejectReason(file: { name: string; type: string; size: number }): string | null {
  const kind = kindForMime(file.type);
  if (!kind) {
    return `${file.name}: that file type isn't supported (${file.type || "unknown"}). Photos, videos, audio, PDF, Word, Excel and text files are accepted.`;
  }
  if (!ALL_ALLOWED_MIME.includes((file.type || "").toLowerCase()) && kind === "document") {
    return `${file.name}: that document type isn't supported.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${humanSize(file.size)} — the limit is ${humanSize(MAX_UPLOAD_BYTES)} per file. Trim or split the recording, or ask for the storage limit to be raised.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
