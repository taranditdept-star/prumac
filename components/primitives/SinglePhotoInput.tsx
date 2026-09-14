"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { compressImage, fileToDataUrl, dataUrlToFile } from "@/lib/image/compress";
import { CameraCapture } from "@/components/primitives/CameraCapture";

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
 *
 * "Take photo" opens the IN-PAGE camera rather than `<input capture>`. Drivers
 * reported the odometer photo "just disappearing": the system camera app lets
 * Android discard the web page while it is open, so on return the capture was
 * never delivered and the form was empty — and because the odometer photo is
 * required, they could not start the trip at all. Staying in the page keeps the
 * app in the foreground. The file input remains as a fallback for when the
 * in-page camera is unavailable or the permission is denied.
 */
export function SinglePhotoInput({ onFileChange, label = "Add photo", persistKey, cameraOnly }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
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

  async function accept(raw: File) {
    setBusy(true);
    try {
      const file = await compressImage(raw);
      const d = await fileToDataUrl(file);
      setDataUrl(d);
      onFileChange(file);
      if (persistKey) {
        // Only persist what will actually restore. compressImage returns the
        // ORIGINAL file when it cannot decode the format (HEIC on some phones),
        // and a multi-megabyte data URL blows the ~5MB sessionStorage quota —
        // which used to fail silently, so a reload lost the photo anyway.
        if (d.length < 2_000_000) {
          try { sessionStorage.setItem(persistKey, JSON.stringify({ dataUrl: d, name: file.name })); }
          catch { /* quota — the photo is still held in memory for this submit */ }
        }
      }
    } catch {
      // Never fail silently: an unreadable photo previously left the driver
      // staring at an empty slot with no idea why.
      onFileChange(null);
      setDataUrl(null);
      alert("That photo could not be read. Please take it again.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    await accept(raw);
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
          onClick={() => setShowCamera(true)}
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

      {showCamera && (
        <CameraCapture
          onCapture={(file) => { setShowCamera(false); void accept(file); }}
          onClose={() => setShowCamera(false)}
          onUnavailable={() => {
            // No in-page camera (unsupported or permission denied) — fall back
            // to the system camera rather than leaving the driver stuck.
            setShowCamera(false);
            camRef.current?.click();
          }}
        />
      )}
    </>
  );
}
