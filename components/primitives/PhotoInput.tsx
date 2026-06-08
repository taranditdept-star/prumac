"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2, ImageOff } from "lucide-react";
import { compressImage } from "@/lib/image/compress";

interface PhotoInputProps {
  name: string;
  max?: number;
  label?: string;
  /** Receives the (compressed) files whenever the selection changes. */
  onFilesChange?: (files: File[]) => void;
}

interface Item {
  file: File;
  url: string;
}

export function PhotoInput({ name, max = 6, label = "Add photos", onFilesChange }: PhotoInputProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => items.forEach((it) => URL.revokeObjectURL(it.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(picked: File[]) {
    if (!picked.length) return;
    setBusy(true);
    try {
      const room = Math.max(0, max - items.length);
      const slice = picked.slice(0, room);
      const compressed = await Promise.all(slice.map((f) => compressImage(f)));
      const next = [...items, ...compressed.map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
      setItems(next);
      onFilesChange?.(next.map((it) => it.file));
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
    const it = items[i];
    if (it) URL.revokeObjectURL(it.url);
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    onFilesChange?.(next.map((x) => x.file));
  }

  return (
    <div className="space-y-3" data-photo-input={name}>
      {/* Action buttons — camera OR gallery, both supported */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={busy || items.length >= max}
          className="h-12 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <Camera className="h-4 w-4" /> Take photo
        </button>
        <button
          type="button"
          onClick={() => galRef.current?.click()}
          disabled={busy || items.length >= max}
          className="h-12 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" /> Upload
        </button>
      </div>

      {/* Camera: opens the rear camera. Gallery: lets you pick existing photos. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleInput} className="sr-only" />
      <input ref={galRef} type="file" accept="image/*" multiple onChange={handleInput} className="sr-only" />

      {busy && (
        <p className="inline-flex items-center gap-2 text-xs text-ink-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing photo…
        </p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((it, i) => (
            <Thumb key={it.url} url={it.url} onRemove={() => remove(i)} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink-400">
        {items.length}/{max} photo{items.length !== 1 ? "s" : ""} attached
        {label ? ` · ${label}` : ""}
      </p>
    </div>
  );
}

function Thumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-ink-200 bg-ink-50 group">
      {broken ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-ink-400 gap-1">
          <ImageOff className="h-5 w-5" />
          <span className="text-[9px] font-bold uppercase">Attached</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="attachment" className="w-full h-full object-cover" onError={() => setBroken(true)} />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-ink-950/70 backdrop-blur text-white flex items-center justify-center opacity-90 active:scale-95 transition-all"
        aria-label="Remove photo"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
