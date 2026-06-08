"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { compressImage, fileToDataUrl, dataUrlToFile } from "@/lib/image/compress";

interface Props {
  onFileChange: (file: File | null) => void;
  label?: string;
  /** Persist to sessionStorage so a tab reload during camera doesn't lose it. */
  persistKey?: string;
  /** Hide the gallery option (e.g. odometer must be a live photo). */
  cameraOnly?: boolean;
}

/**
 * Single-photo capture (camera + gallery) with an instant, reload-safe preview.
 * Buttons are type="button" so they never submit the form; the chosen photo is
 * compressed and handed to the parent via onFileChange to send on submit.
 */
export function SinglePhotoInput({ onFileChange, label = "Add photo", persistKey, cameraOnly }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (!persistKey || restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(persistKey);
      if (!raw) return;
      const { dataUrl: d, name } = JSON.parse(raw) as { dataUrl: string; name: string };
      if (d) { setDataUrl(d); onFileChange(dataUrlToFile(d, name)); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    setBusy(true);
    try {
      const file = await compressImage(raw);
      const d = await fileToDataUrl(file);
      setDataUrl(d);
      onFileChange(file);
      if (persistKey) {
        try { sessionStorage.setItem(persistKey, JSON.stringify({ dataUrl: d, name: file.name })); } catch { /* full */ }
      }
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setDataUrl(null);
    onFileChange(null);
    if (persistKey) sessionStorage.removeItem(persistKey);
  }

  if (dataUrl) {
    return (
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-ink-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={label} className="w-full max-h-60 object-cover" />
        <button
          type="button"
          onClick={clear}
          className="absolute top-2.5 right-2.5 h-9 w-9 rounded-full bg-ink-950/70 backdrop-blur text-white flex items-center justify-center active:scale-95"
          aria-label="Remove photo"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={`grid gap-2.5 ${cameraOnly ? "grid-cols-1" : "grid-cols-2"}`}>
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={busy}
          className="h-16 rounded-2xl border-2 border-dashed border-ink-200 bg-white text-ink-600 inline-flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          <span className="text-[11px] font-bold uppercase tracking-wider">{busy ? "Processing…" : "Take photo"}</span>
        </button>
        {!cameraOnly && (
          <button
            type="button"
            onClick={() => galRef.current?.click()}
            disabled={busy}
            className="h-16 rounded-2xl border-2 border-dashed border-ink-200 bg-white text-ink-600 inline-flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px] font-bold uppercase tracking-wider">Upload</span>
          </button>
        )}
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" tabIndex={-1} />
      <input ref={galRef} type="file" accept="image/*" onChange={pick} className="sr-only" tabIndex={-1} />
    </>
  );
}
