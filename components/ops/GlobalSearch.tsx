"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Truck, User, Map, Building2, Loader2, CornerDownLeft } from "lucide-react";
import { searchEverything, type SearchHit } from "@/actions/search";

const ICON = {
  vehicle: Truck,
  driver: User,
  trip: Map,
  subsidiary: Building2,
} as const;

export function GlobalSearch() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K to focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await searchEverything(term);
          setHits(res);
          setActive(0);
          setOpen(true);
        } finally {
          setLoading(false);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter") { e.preventDefault(); const h = hits[active]; if (h) go(h); }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="flex-1 max-w-md relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search vehicles, drivers, trips…"
          className="h-10 w-full rounded-xl border border-ink-200 bg-ink-50 pl-10 pr-12 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:bg-white focus:border-orange-500/40 transition-all"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-0.5 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
          ⌘K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-12 z-50 rounded-2xl border border-ink-200 bg-white shadow-xl shadow-ink-900/10 overflow-hidden">
          {loading && hits.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-4 text-sm text-ink-500">No matches for “{q.trim()}”.</div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {hits.map((h, i) => {
                const Icon = ICON[h.type];
                return (
                  <li key={`${h.type}-${h.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === active ? "bg-orange-50" : "hover:bg-ink-50"
                      }`}
                    >
                      <span className="h-8 w-8 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-ink-600" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink-900 truncate">{h.label}</span>
                        {h.sublabel && <span className="block text-xs text-ink-500 truncate">{h.sublabel}</span>}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-ink-400 font-bold shrink-0">{h.type}</span>
                      {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-ink-400 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
