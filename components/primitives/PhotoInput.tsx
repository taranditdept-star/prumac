"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";

interface PhotoInputProps {
  name: string;
  max?: number;
  label?: string;
}

export function PhotoInput({ name, max = 6, label = "Add photos" }: PhotoInputProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const next = [...files, ...picked].slice(0, max);
    setFiles(next);
    setUrls(next.map((f) => URL.createObjectURL(f)));
    e.target.value = "";
  }

  function remove(i: number) {
    const next = [...files];
    next.splice(i, 1);
    setFiles(next);
    setUrls(next.map((f) => URL.createObjectURL(f)));
  }

  return (
    <div className="space-y-2">
      {/* Hidden inputs that will be submitted with the form */}
      {files.map((file, i) => (
        <HiddenFile key={i} name={name} file={file} />
      ))}

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <div
            key={i}
            className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-ink-200 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-ink-950/70 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {files.length < max && (
          <label className="aspect-square rounded-xl border-2 border-dashed border-ink-200 hover:border-orange-300 hover:bg-orange-50/40 flex flex-col items-center justify-center cursor-pointer transition-all">
            <Camera className="h-5 w-5 text-ink-400 mb-1" />
            <span className="text-[10px] uppercase tracking-wider text-ink-400 font-bold text-center px-1">
              {files.length === 0 ? label : "Add more"}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handleSelect}
              className="sr-only"
            />
          </label>
        )}
      </div>
      <p className="text-[10px] text-ink-400">
        {files.length}/{max} photo{files.length !== 1 ? "s" : ""} attached
      </p>
    </div>
  );
}

/**
 * Renders a hidden file input populated from a JS File object so the file
 * gets submitted with the surrounding <form>. Uses DataTransfer to assign.
 */
function HiddenFile({ name, file }: { name: string; file: File }) {
  function setRef(el: HTMLInputElement | null) {
    if (!el || !file) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
    } catch {
      /* iOS Safari sometimes blocks DataTransfer in older versions; skip */
    }
  }
  return <input ref={setRef} type="file" name={name} className="sr-only" tabIndex={-1} />;
}
