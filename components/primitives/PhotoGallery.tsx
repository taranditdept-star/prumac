"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageOff } from "lucide-react";

interface PhotoGalleryProps {
  bucket?: string;
  paths: string[];
}

export function PhotoGallery({ bucket = "photos", paths }: PhotoGalleryProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (paths.length === 0) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 60 * 60);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const row of data) {
        if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
      }
      setUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [bucket, paths]);

  if (paths.length === 0) {
    return (
      <div className="rounded-2xl bg-ink-50/50 border border-dashed border-ink-200 py-8 text-center">
        <div className="inline-flex h-10 w-10 rounded-xl bg-white items-center justify-center ring-1 ring-ink-100 mb-2">
          <ImageOff className="h-4 w-4 text-ink-400" />
        </div>
        <p className="text-xs text-ink-500">No photos uploaded</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {paths.map((p, i) => {
          const url = urls[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => url && setOpenIdx(i)}
              className="aspect-square rounded-xl bg-ink-100 overflow-hidden ring-1 ring-ink-200 hover:ring-orange-300 transition-all"
            >
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-ink-200 to-ink-100 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {openIdx !== null && urls[paths[openIdx]] && (
        <button
          type="button"
          onClick={() => setOpenIdx(null)}
          className="fixed inset-0 z-50 bg-ink-950/90 backdrop-blur flex items-center justify-center p-6 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[paths[openIdx]]}
            alt=""
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        </button>
      )}
    </>
  );
}
