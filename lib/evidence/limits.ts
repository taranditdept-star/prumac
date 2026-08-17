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
    "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/x-aac",
    "audio/ogg", "audio/opus", "audio/wav", "audio/x-wav", "audio/vnd.wave",
    "audio/webm", "audio/x-m4a", "audio/m4a", "audio/3gpp", "audio/3gpp2",
    "audio/amr", "audio/AMR", "audio/flac", "audio/x-flac",
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

/**
 * File EXTENSIONS matter as much as MIME types in the `accept` attribute:
 * Windows often has no MIME mapping for .opus / .amr / .m4a, so a MIME-only
 * accept list greys those files out in the picker — which is exactly why
 * WhatsApp voice notes looked impossible to attach.
 */
const EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
  ".mp4", ".mov", ".webm", ".mkv", ".3gp", ".mpeg", ".mpg",
  ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".amr", ".flac",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt",
];

/** The `accept` attribute for a file input (MIME types AND extensions). */
export const ACCEPT_ATTR = [...ALL_ALLOWED_MIME, ...EXTENSIONS].join(",");

/** Narrower accept lists so the operator can pick the right kind directly. */
export const ACCEPT_MEDIA = [
  ...ALLOWED.photo, ...ALLOWED.video,
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".mov", ".webm", ".mkv", ".3gp",
].join(",");

export const ACCEPT_AUDIO = [
  ...ALLOWED.audio,
  ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".amr", ".flac", ".3gp",
].join(",");

export const ACCEPT_DOCS = [
  ...ALLOWED.document, ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt",
].join(",");

const EXT_KIND: Record<string, MediaKind> = {
  jpg: "photo", jpeg: "photo", png: "photo", webp: "photo", heic: "photo", heif: "photo",
  mp4: "video", mov: "video", webm: "video", mkv: "video", "3gp": "video", mpeg: "video", mpg: "video",
  mp3: "audio", m4a: "audio", aac: "audio", ogg: "audio", oga: "audio", opus: "audio",
  wav: "audio", amr: "audio", flac: "audio",
  pdf: "document", doc: "document", docx: "document", xls: "document", xlsx: "document", txt: "document",
};

/**
 * Work out the kind from the MIME type, falling back to the FILE EXTENSION.
 * Windows frequently hands over an empty `file.type` for .opus / .amr / .m4a, so
 * a MIME-only check would reject a perfectly good voice note.
 */
export function kindForMime(mime: string, filename?: string): MediaKind | null {
  const m = (mime || "").toLowerCase();
  for (const [kind, list] of Object.entries(ALLOWED)) {
    if (list.includes(m)) return kind as MediaKind;
  }
  if (m.startsWith("image/")) return "photo";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";

  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  return EXT_KIND[ext] ?? null;
}

/** Best-guess content type for upload when the browser gives us nothing. */
export function contentTypeFor(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    opus: "audio/opus", oga: "audio/ogg", ogg: "audio/ogg", amr: "audio/amr",
    m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac",
    mov: "video/quicktime", mkv: "video/x-matroska", "3gp": "video/3gpp", mp4: "video/mp4",
    heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf", txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

export function humanSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Returns a human-readable reason the file can't be uploaded, or null if it's fine. */
export function rejectReason(file: { name: string; type: string; size: number }): string | null {
  const kind = kindForMime(file.type, file.name);
  if (!kind) {
    return `${file.name}: that file type isn't supported (${file.type || "unknown"}). Photos, videos, audio (including WhatsApp voice notes), PDF, Word, Excel and text files are accepted.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${humanSize(file.size)} — the limit is ${humanSize(MAX_UPLOAD_BYTES)} per file. Trim or split the recording, or ask for the storage limit to be raised.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}
