"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * Debounced search box that drives a `?q=` URL param. The page reads `q` and
 * filters its already-loaded list — works for any server-rendered list page.
 */
export function ListSearchInput({ basePath, placeholder = "Search…" }: { basePath: string; placeholder?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("q") ?? "";
  const [q, setQ] = useState(current);

  // Keep in sync if the URL changes elsewhere (e.g. Clear).
  useEffect(() => { setQ(current); }, [current]);

  // Push debounced changes to the URL.
  useEffect(() => {
    const v = q.trim();
    if (v === current) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (v) params.set("q", v); else params.delete("q");
      router.replace(`${basePath}?${params.toString()}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="relative flex-1 min-w-64 max-w-md">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-9 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md text-ink-400 hover:bg-ink-100 flex items-center justify-center"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
