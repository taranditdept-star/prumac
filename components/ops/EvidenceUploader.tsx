"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, RotateCw, X, FileText, Film, Mic, ImageIcon, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { attachAccidentMedia } from "@/actions/accident-evidence";
import {
  EVIDENCE_BUCKET, ACCEPT_ATTR, MAX_UPLOAD_BYTES, humanSize, kindForMime, rejectReason, type MediaKind,
} from "@/lib/evidence/limits";

interface Job {
  id: string;
  name: string;
  size: number;
  kind: MediaKind;
  status: "uploading" | "saving" | "done" | "error";
  message?: string;
  file?: File;
}

const ICON: Record<MediaKind, typeof ImageIcon> = {
  photo: ImageIcon,
  video: Film,
  audio: Mic,
  document: FileText,
};

/**
 * Attaches evidence to an EXISTING accident report.
 *
 * Files go straight from the browser to Supabase Storage (a Server Action body
 * is capped ~4.5 MB on Vercel, so a video or a long recording can't go through
 * one), then a small action records the metadata row. Rejections are surfaced
 * verbatim — the older photo uploader swallowed 413/415 into a bare "Retry".
 */
export function EvidenceUploader({ accidentId }: { accidentId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const sb = useRef(createClient());

  const patch = (id: string, next: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...next } : j)));

  const uploadOne = useCallback(
    async (file: File, id: string) => {
      const kind = kindForMime(file.type) ?? "document";
      try {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
        const path = `accident/${accidentId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await sb.current.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) {
          // Storage speaks plainly here: mime rejections and size rejections both
          // arrive as messages worth showing the operator.
          patch(id, { status: "error", message: upErr.message, file });
          return;
        }

        patch(id, { status: "saving" });
        const res = await attachAccidentMedia({
          accident_id: accidentId,
          file_path: path,
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        });
        if ("error" in res) {
          patch(id, { status: "error", message: res.error, file });
          return;
        }
        patch(id, { status: "done", file: undefined });
        router.refresh();
      } catch (e) {
        patch(id, { status: "error", message: e instanceof Error ? e.message : "Upload failed", file });
      }
    },
    [accidentId, router],
  );

  const add = useCallback(
    (picked: File[]) => {
      for (const file of picked) {
        const bad = rejectReason(file);
        if (bad) {
          toast.error(bad);
          continue;
        }
        const id = crypto.randomUUID();
        const kind = kindForMime(file.type) ?? "document";
        setJobs((prev) => [...prev, { id, name: file.name, size: file.size, kind, status: "uploading", file }]);
        void uploadOne(file, id);
      }
    },
    [uploadOne],
  );

  const busy = jobs.some((j) => j.status === "uploading" || j.status === "saving");

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(Array.from(e.dataTransfer.files ?? []));
        }}
        className="rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50/40 p-6 text-center"
      >
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-ink-200">
          <Upload className="h-5 w-5 text-orange-600" />
        </div>
        <p className="text-sm font-semibold text-ink-900">Add photos, video, audio or documents</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
          Drag files here or choose them below. Up to {humanSize(MAX_UPLOAD_BYTES)} per file — a long recording may need
          splitting.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"
        >
          <Upload className="h-4 w-4" /> Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            add(picked);
          }}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const Icon = ICON[j.kind];
            return (
              <li
                key={j.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                  j.status === "error" ? "border-rose-200 bg-rose-50" : "border-ink-200/70 bg-white"
                }`}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{j.name}</p>
                  <p className="text-xs text-ink-500">
                    {humanSize(j.size)}
                    {j.status === "uploading" && " · uploading…"}
                    {j.status === "saving" && " · saving…"}
                    {j.status === "done" && " · attached"}
                  </p>
                  {j.status === "error" && j.message && (
                    <p className="mt-1 text-xs font-medium text-rose-700 break-words">{j.message}</p>
                  )}
                </div>
                {(j.status === "uploading" || j.status === "saving") && (
                  <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-ink-400" />
                )}
                {j.status === "done" && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />}
                {j.status === "error" && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!j.file) return;
                        patch(j.id, { status: "uploading", message: undefined });
                        void uploadOne(j.file, j.id);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-100"
                      aria-label="Retry"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setJobs((prev) => prev.filter((x) => x.id !== j.id))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100"
                      aria-label="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {busy && <p className="text-xs text-ink-400">Keep this page open until every file says &ldquo;attached&rdquo;.</p>}
    </div>
  );
}
