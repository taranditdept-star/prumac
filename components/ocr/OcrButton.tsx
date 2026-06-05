"use client";

import { useRef, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { recognizeImage } from "@/lib/ocr/tesseract";

interface OcrButtonProps {
  label?: string;
  onText: (text: string) => void;
  className?: string;
}

const DEFAULT_CLS =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold hover:bg-ink-50 transition-all disabled:opacity-60";

export function OcrButton({ label = "Scan photo", onText, className }: OcrButtonProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setBusy(true);
    setPct(0);
    try {
      const text = await recognizeImage(file, setPct);
      if (!text.trim()) {
        toast.error("Couldn't read any text — try a clearer, well-lit photo.");
      } else {
        onText(text);
      }
    } catch {
      toast.error("Scan failed. You can still enter the details manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className={className ?? DEFAULT_CLS}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning {pct}%
          </>
        ) : (
          <>
            <ScanLine className="h-4 w-4" />
            {label}
          </>
        )}
      </button>
    </>
  );
}
