"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal, Loader2 } from "lucide-react";

/**
 * A row-level "⋯" actions menu.
 *
 * Rendered in a PORTAL with fixed positioning because every list here sits in an
 * `overflow-hidden` card + `overflow-x-auto` scroller, which would clip a normal
 * CSS dropdown. Closes on outside click, Escape, scroll and resize.
 */

export interface RowAction {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Navigate instead of running a handler. */
  href?: string;
  onSelect?: () => void;
  tone?: "default" | "warn" | "danger";
  /** Small muted line under the label. */
  hint?: string;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
}

const TONE: Record<NonNullable<RowAction["tone"]>, string> = {
  default: "text-ink-700 hover:bg-ink-50",
  warn: "text-amber-700 hover:bg-amber-50",
  danger: "text-rose-600 hover:bg-rose-50",
};

const MENU_W = 232;

export function RowMenu({
  actions,
  busy = false,
  ariaLabel = "Row actions",
}: {
  actions: RowAction[];
  busy?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const estH = Math.min(actions.length * 44 + 12, 420);
    const below = window.innerHeight - b.bottom;
    const top = below < estH + 12 && b.top > estH + 12 ? b.top - estH - 6 : b.bottom + 6;
    const left = Math.max(8, Math.min(b.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos({ top, left });
  }, [actions.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    // capture:true so it also fires for the scrolling table container
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const visible = actions.filter((a) => a.label);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy || visible.length === 0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:opacity-40 ${
          open ? "bg-orange-50 text-orange-600" : "text-ink-400 hover:bg-ink-100 hover:text-ink-800"
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {mounted && open && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ top: pos.top, left: pos.left, width: MENU_W }}
              className="fixed z-[70] overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-2xl"
            >
              {visible.map((a) => {
                const cls = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors ${
                  a.disabled ? "cursor-not-allowed text-ink-300" : TONE[a.tone ?? "default"]
                }`;
                const body = (
                  <>
                    {a.icon && <span className="shrink-0">{a.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.label}</span>
                      {a.hint && <span className="block truncate text-[11px] font-normal text-ink-400">{a.hint}</span>}
                    </span>
                  </>
                );
                return (
                  <div key={a.key}>
                    {a.separatorBefore && <div className="my-1 border-t border-ink-100" />}
                    {a.href && !a.disabled ? (
                      <Link href={a.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={a.disabled}
                        onClick={() => {
                          setOpen(false);
                          a.onSelect?.();
                        }}
                        className={cls}
                      >
                        {body}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
