"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { compressImage, fileToDataUrl, dataUrlToFile } from "@/lib/image/compress";

interface PhotoInputProps {
  name: string;
  max?: number;
  label?: string;
  /** Receives the (compressed) files whenever the selection changes. */
  onFilesChange?: (files: File[]) => void;
  /**
   * If set, photos are saved to sessionStorage under this key and restored on
   * mount — so if the mobile browser reloads the tab while the camera is open
   * (common with many tabs open), the captured photos are NOT lost.
   */
  persistKey?: string;
}

interface Item {
  file: File;
  dataUrl: string; // data URL = preview that also survives a reload
}

export function PhotoInput({ name, max = 6, label = "Add photos", onFilesChange, persistKey }: PhotoInputProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  // Restore persisted photos once on mount.
  useEffect(() => {
    if (!persistKey || restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(persistKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { dataUrl: string; name: string }[];
      const next = saved.slice(0, max).map((s) => ({ file: dataUrlToFile(s.dataUrl, s.name), dataUrl: s.dataUrl }));
      if (next.length) {
        setItems(next);
        onFilesChange?.(next.map((it) => it.file));
      }
    } catch {
      /* ignore corrupt drafts */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Item[]) {
    if (!persistKey) return;
    try {
      if (next.length === 0) sessionStorage.removeItem(persistKey);
      else sessionStorage.setItem(persistKey, JSON.stringify(next.map((it) => ({ dataUrl: it.dataUrl, name: it.file.name }))));
    } catch {
      /* sessionStorage may be full — ignore, preview still works in memory */
    }
  }

  async function add(picked: File[]) {
    if (!picked.length) return;
    setBusy(true);
    try {
      const room = Math.max(0, max - items.length);
      const slice = picked.slice(0, room);
      const compressed = await Promise.all(slice.map((f) => compressImage(f)));
      const built = await Promise.all(
        compressed.map(async (f) => ({ file: f, dataUrl: await fileToDataUrl(f) })),
      );
      const next = [...items, ...built];
      setItems(next);
      onFilesChange?.(next.map((it) => it.file));
      persist(next);
    } finally {
      setBusy(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    void add(picked);
  }

  function remove(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    onFilesChange?.(next.map((x) => x.file));
    persist(next);
  }

  const full = items.length >= max;

  return (
    <div className="space-y-3" data-photo-input={name}>
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((it, i) => (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-ink-200 bg-ink-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.dataUrl} alt="attachment" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-ink-950/70 backdrop-blur text-white flex items-center justify-center active:scale-95"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!full && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => camRef.current?.click()}
            disabled={busy}
            className="h-14 rounded-2xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold inline-flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Camera className="h-5 w-5" /> <span className="text-[11px]">Take photo</span>
          </button>
          <button
            type="button"
            onClick={() => galRef.current?.click()}
            disabled={busy}
            className="h-14 rounded-2xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold inline-flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" /> <span className="text-[11px]">Upload</span>
          </button>
        </div>
      )}

      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleInput} className="sr-only" tabIndex={-1} />
      <input ref={galRef} type="file" accept="image/*" multiple onChange={handleInput} className="sr-only" tabIndex={-1} />

      <p className="text-[11px] text-ink-400">
        {busy ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</span>
        ) : (
          <>{items.length}/{max} {items.length === 1 ? "photo" : "photos"}{label ? ` · ${label}` : ""}</>
        )}
      </p>
    </div>
  );
}
