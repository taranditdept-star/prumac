"use client";

import { useState } from "react";
import { FileText, Film, Mic, ImageIcon, X, Trash2, ExternalLink, UserCircle2 } from "lucide-react";
import { humanSize, type MediaKind } from "@/lib/evidence/limits";

export interface GalleryItem {
  id: string;
  kind: MediaKind;
  url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  created_at: string;
  /** committee / driver / police / insurer / workshop / witness / other */
  source?: string;
  source_detail?: string | null;
  uploaded_by_name?: string | null;
}

const ICON: Record<MediaKind, typeof ImageIcon> = { photo: ImageIcon, video: Film, audio: Mic, document: FileText };
const LABEL: Record<MediaKind, string> = { photo: "Photo", video: "Video", audio: "Audio", document: "Document" };

export const SOURCE_LABELS: Record<string, string> = {
  committee: "PRUMAC Committee",
  driver: "Driver",
  police: "Police",
  insurer: "Insurer",
  workshop: "Workshop",
  witness: "Witness",
  other: "Other",
};

const SOURCE_STYLE: Record<string, string> = {
  committee: "bg-orange-50 text-orange-700 ring-orange-200",
  driver: "bg-sky-50 text-sky-700 ring-sky-200",
  police: "bg-violet-50 text-violet-700 ring-violet-200",
  insurer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  workshop: "bg-amber-50 text-amber-700 ring-amber-200",
  witness: "bg-ink-100 text-ink-700 ring-ink-200",
  other: "bg-ink-100 text-ink-600 ring-ink-200",
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
  });
}

/** "PRUMAC Committee · Mr Vuranda interview · uploaded by Tendai · 17 Aug 2026, 17:10" */
export function SourceTag({ it, dark = false }: { it: GalleryItem; dark?: boolean }) {
  const src = it.source ?? "committee";
  const label = SOURCE_LABELS[src] ?? src;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
          SOURCE_STYLE[src] ?? SOURCE_STYLE.other
        }`}
      >
        <UserCircle2 className="h-3 w-3" /> {label}
      </span>
      <span className={`text-[10px] ${dark ? "text-white/50" : "text-ink-400"}`}>
        {it.source_detail ? `${it.source_detail} · ` : ""}
        {it.uploaded_by_name ? `added by ${it.uploaded_by_name} · ` : ""}
        {fmtWhen(it.created_at)}
      </span>
    </div>
  );
}

/**
 * Renders accident evidence: photos in a lightbox, video and audio with native
 * players, documents as a labelled link. Every URL is a short-lived signed URL
 * minted on the server — nothing here talks to Storage directly, so it works
 * for an anonymous (password-verified) viewer too.
 */
export function EvidenceGallery({
  items,
  onDelete,
  allowOpenInNewTab = true,
}: {
  items: GalleryItem[];
  /** Admin-only: show a remove button per item. */
  onDelete?: (id: string) => void;
  allowOpenInNewTab?: boolean;
}) {
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/40 px-4 py-8 text-center text-sm text-ink-500">
        No evidence attached yet.
      </p>
    );
  }

  const photos = items.filter((i) => i.kind === "photo");
  const videos = items.filter((i) => i.kind === "video");
  const audios = items.filter((i) => i.kind === "audio");
  const docs = items.filter((i) => i.kind === "document");

  return (
    <div className="space-y-6">
      {photos.length > 0 && (
        <Section title="Photos" count={photos.length}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((it) => (
              <figure key={it.id} className="group relative overflow-hidden rounded-2xl ring-1 ring-ink-200">
                <button
                  type="button"
                  onClick={() => setLightbox(it)}
                  className="block aspect-square w-full bg-ink-100"
                  aria-label={`View ${it.original_filename ?? "photo"}`}
                >
                  {it.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt={it.caption ?? it.original_filename ?? "Accident photo"} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-ink-400">
                      <ImageIcon className="h-5 w-5" />
                    </span>
                  )}
                </button>
                {onDelete && <RemoveBtn onClick={() => onDelete(it.id)} />}
                <figcaption className="bg-white px-2 py-1.5">
                  {it.caption && <span className="block text-[11px] text-ink-600 line-clamp-2">{it.caption}</span>}
                  <SourceTag it={it} />
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {videos.length > 0 && (
        <Section title="Video" count={videos.length}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {videos.map((it) => (
              <div key={it.id} className="relative overflow-hidden rounded-2xl border border-ink-200 bg-black">
                {it.url ? (
                  <video controls preload="metadata" playsInline className="h-full w-full bg-black" src={it.url}>
                    Your browser can&apos;t play this video.
                  </video>
                ) : (
                  <p className="p-6 text-sm text-white/70">This video couldn&apos;t be loaded.</p>
                )}
                <Meta it={it} onDelete={onDelete} allowOpenInNewTab={allowOpenInNewTab} dark />
              </div>
            ))}
          </div>
        </Section>
      )}

      {audios.length > 0 && (
        <Section title="Audio statements" count={audios.length}>
          <ul className="space-y-3">
            {audios.map((it) => (
              <li key={it.id} className="rounded-2xl border border-ink-200 bg-white p-3">
                <div className="mb-2 flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Mic className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {it.caption || it.original_filename || "Recording"}
                    </p>
                    <p className="text-[11px] text-ink-400">
                      {LABEL[it.kind]}
                      {it.size_bytes ? ` · ${humanSize(it.size_bytes)}` : ""}
                    </p>
                    <SourceTag it={it} />
                  </div>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(it.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {it.url ? (
                  <audio controls preload="metadata" className="w-full" src={it.url}>
                    Your browser can&apos;t play this recording.
                  </audio>
                ) : (
                  <p className="text-xs text-rose-600">This recording couldn&apos;t be loaded.</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {docs.length > 0 && (
        <Section title="Documents" count={docs.length}>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
            {docs.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {it.original_filename ?? "Document"}
                  </p>
                  {it.caption && <p className="truncate text-xs text-ink-500">{it.caption}</p>}
                  <SourceTag it={it} />
                </div>
                {it.url && allowOpenInNewTab && (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                  >
                    Open <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(it.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Photo lightbox */}
      {lightbox?.url && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.caption ?? "Accident photo"}
            className="max-h-full max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
        {title} ({count})
      </p>
      {children}
    </section>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950/70 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function Meta({
  it, onDelete, allowOpenInNewTab, dark,
}: {
  it: GalleryItem;
  onDelete?: (id: string) => void;
  allowOpenInNewTab?: boolean;
  dark?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${dark ? "bg-ink-900 text-white" : "bg-white"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{it.caption || it.original_filename || "Video"}</p>
        <p className={`text-[11px] ${dark ? "text-white/50" : "text-ink-400"}`}>
          {it.size_bytes ? humanSize(it.size_bytes) : ""}
        </p>
        <SourceTag it={it} dark={dark} />
      </div>
      {it.url && allowOpenInNewTab && (
        <a
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${dark ? "text-white/80 hover:bg-white/10" : "text-ink-600 hover:bg-ink-50"}`}
        >
          Full screen
        </a>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(it.id)}
          aria-label="Remove"
          className={`shrink-0 rounded-lg p-1.5 ${dark ? "text-rose-300 hover:bg-white/10" : "text-rose-600 hover:bg-rose-50"}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
