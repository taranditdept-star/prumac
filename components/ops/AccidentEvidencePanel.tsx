"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Tag, Loader2 } from "lucide-react";
import { EvidenceUploader } from "@/components/ops/EvidenceUploader";
import { EvidenceGallery, SOURCE_LABELS, type GalleryItem } from "@/components/primitives/EvidenceGallery";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { deleteAccidentMedia, setAccidentMediaAttribution } from "@/actions/accident-evidence";

const SOURCES = Object.entries(SOURCE_LABELS);

export function AccidentEvidencePanel({
  accidentId,
  items,
}: {
  accidentId: string;
  items: GalleryItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [source, setSource] = useState("committee");
  const [detail, setDetail] = useState("");
  const [caption, setCaption] = useState("");

  function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (!confirm(`Remove ${it?.original_filename ?? "this attachment"}? This deletes the file permanently.`)) return;
    startTransition(async () => {
      const r = await deleteAccidentMedia(id);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Attachment removed");
        router.refresh();
      }
    });
  }

  function openEdit(it: GalleryItem) {
    setEditing(it);
    setSource(it.source ?? "committee");
    setDetail(it.source_detail ?? "");
    setCaption(it.caption ?? "");
  }

  function saveEdit() {
    if (!editing) return;
    startTransition(async () => {
      const r = await setAccidentMediaAttribution(editing.id, {
        source,
        source_detail: detail,
        caption,
      });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Attribution updated");
        setEditing(null);
        router.refresh();
      }
    });
  }

  // A quick count by source, so the provenance of the whole file is obvious.
  const bySource = items.reduce<Record<string, number>>((acc, it) => {
    const s = it.source ?? "committee";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const field =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <Paperclip className="h-4 w-4 text-orange-600" /> Evidence
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Photos, video, audio statements and documents — each tagged with who it came from.
          </p>
          {Object.keys(bySource).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(bySource).map(([s, n]) => (
                <span key={s} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-600">
                  {SOURCE_LABELS[s] ?? s}: {n}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-bold text-ink-600">
          {items.length} {items.length === 1 ? "file" : "files"}
        </span>
      </div>

      <EvidenceUploader accidentId={accidentId} />

      {items.length > 0 && (
        <div className="rounded-xl border border-ink-200/70 bg-ink-50/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
            <Tag className="h-3.5 w-3.5" /> Re-tag an item
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => openEdit(it)}
                className="max-w-[220px] truncate rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-orange-300 hover:text-orange-700"
              >
                {it.original_filename ?? it.kind}
              </button>
            ))}
          </div>
        </div>
      )}

      <EvidenceGallery items={items} onDelete={remove} />

      <EditDrawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Who is this evidence from?"
        subtitle={editing?.original_filename ?? ""}
        widthClass="w-full max-w-lg"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Evidence is from</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={`mt-1 ${field}`}>
              {SOURCES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Detail</span>
            <input
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="e.g. Mr Vuranda — committee interview"
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Caption</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What this shows"
              className={`mt-1 ${field}`}
            />
          </label>
          {editing?.uploaded_by_name && (
            <p className="text-xs text-ink-500">
              Attached by <span className="font-semibold text-ink-700">{editing.uploaded_by_name}</span> — that record
              can&apos;t be changed.
            </p>
          )}
          <button
            type="button"
            onClick={saveEdit}
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </EditDrawer>
    </section>
  );
}
