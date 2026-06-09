"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage, makeThumbDataUrl } from "@/lib/image/compress";
import { CameraCapture } from "@/components/primitives/CameraCapture";

const BUCKET = "photos";

interface Item {
  id: string;
  thumb: string;
  path: string | null;
  status: "uploading" | "done" | "error";
  file?: File; // kept only while uploading / on error (for retry)
}

interface PhotoUploaderProps {
  /** Storage path prefix, e.g. "accident" → accident/<uuid>.jpg */
  folder: string;
  /** Receives the storage paths of successfully uploaded photos. */
  onPathsChange: (paths: string[]) => void;
  /**
   * Persist uploaded paths + tiny thumbnails under this sessionStorage key, so
   * a mobile tab reload (Android discarding the tab during the camera) doesn't
   * lose already-uploaded photos.
   */
  persistKey?: string;
  label?: string;
}

/**
 * Uploads photos DIRECTLY from the browser to Supabase Storage — no Server
 * Action / Vercel request-body limit, so there's no practical size cap and any
 * number of photos can be attached. HEIC and other camera formats are
 * normalised to JPEG (high quality) so previews and downloads work everywhere.
 */
export function PhotoUploader({ folder, onPathsChange, persistKey, label = "photos" }: PhotoUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);
  const sb = useRef(createClient());

  const emit = useCallback(
    (list: Item[]) => onPathsChange(list.filter((i) => i.status === "done" && i.path).map((i) => i.path as string)),
    [onPathsChange],
  );

  const persist = useCallback(
    (list: Item[]) => {
      if (!persistKey) return;
      try {
        const done = list.filter((i) => i.status === "done" && i.path).map((i) => ({ path: i.path, thumb: i.thumb }));
        if (done.length === 0) sessionStorage.removeItem(persistKey);
        else sessionStorage.setItem(persistKey, JSON.stringify(done));
      } catch {
        /* quota — previews still work in memory */
      }
    },
    [persistKey],
  );

  // Restore already-uploaded photos after a reload.
  useEffect(() => {
    if (!persistKey || restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(persistKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { path: string; thumb: string }[];
      const next = saved
        .filter((s) => s.path)
        .map((s) => ({ id: crypto.randomUUID(), thumb: s.thumb, path: s.path, status: "done" as const }));
      if (next.length) {
        setItems(next);
        emit(next);
      }
    } catch {
      /* ignore corrupt drafts */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadOne = useCallback(
    async (file: File, id: string) => {
      try {
        const compressed = await compressImage(file, 3000, 0.88); // high quality, HEIC→JPEG
        const path = `${folder}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.current.storage
          .from(BUCKET)
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        setItems((prev) => {
          const next = prev.map((it) => (it.id === id ? { ...it, path, status: "done" as const, file: undefined } : it));
          emit(next);
          persist(next);
          return next;
        });
      } catch {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error" as const } : it)));
      }
    },
    [folder, emit, persist],
  );

  const add = useCallback(
    async (picked: File[]) => {
      for (const file of picked) {
        const id = crypto.randomUUID();
        const thumb = await makeThumbDataUrl(file).catch(() => "");
        setItems((prev) => [...prev, { id, thumb, path: null, status: "uploading", file }]);
        void uploadOne(file, id);
      }
    },
    [uploadOne],
  );

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    void add(picked);
  }

  function retry(id: string) {
    const it = items.find((x) => x.id === id);
    if (!it?.file) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "uploading" } : x)));
    void uploadOne(it.file, id);
  }

  function remove(id: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      emit(next);
      persist(next);
      return next;
    });
  }

  const uploading = items.filter((i) => i.status === "uploading").length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-3" data-photo-uploader={folder}>
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((it) => (
            <div key={it.id} className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-ink-200 bg-ink-50">
              {it.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumb} alt="attachment" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-400">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}

              {/* Status overlay */}
              {it.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-ink-950/40 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {it.status === "error" && (
                <button
                  type="button"
                  onClick={() => retry(it.id)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-950/55 text-white"
                  aria-label="Retry upload"
                >
                  <RotateCw className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">Retry</span>
                </button>
              )}
              {it.status === "done" && (
                <span className="absolute bottom-1.5 left-1.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white/70" />
              )}

              <button
                type="button"
                onClick={() => remove(it.id)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink-950/70 text-white backdrop-blur active:scale-95"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="inline-flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border border-ink-200 bg-white text-sm font-semibold text-ink-700 transition-all active:scale-[0.98]"
        >
          <Camera className="h-5 w-5" /> <span className="text-[11px]">Take photo</span>
        </button>
        <button
          type="button"
          onClick={() => galRef.current?.click()}
          className="inline-flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border border-ink-200 bg-white text-sm font-semibold text-ink-700 transition-all active:scale-[0.98]"
        >
          <ImagePlus className="h-5 w-5" /> <span className="text-[11px]">Upload</span>
        </button>
      </div>

      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleInput} className="sr-only" tabIndex={-1} />
      <input ref={galRef} type="file" accept="image/*" multiple onChange={handleInput} className="sr-only" tabIndex={-1} />

      <p className="text-[11px] text-ink-400">
        {uploading > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading {uploading}…
          </span>
        ) : (
          <>
            {done} {done === 1 ? "photo" : "photos"} attached{label ? ` · ${label}` : ""}
            {failed > 0 && <span className="ml-1 text-rose-500">· {failed} failed — tap to retry</span>}
          </>
        )}
      </p>

      {showCamera && (
        <CameraCapture
          onCapture={(file) => void add([file])}
          onClose={() => setShowCamera(false)}
          onUnavailable={() => {
            // No in-page camera (permission denied / unsupported) — fall back
            // to the system camera file input.
            setShowCamera(false);
            camRef.current?.click();
          }}
        />
      )}
    </div>
  );
}
