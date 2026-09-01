"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, AlertCircle, Info, Check, X, Loader2 } from "lucide-react";
import { loadNotifications, markNotificationsRead } from "@/actions/notification-feed";
import type { Audience, FeedItem } from "@/lib/notifications/feed";

/**
 * The bell, made to actually do something.
 *
 * Before this it was decoration: on the driver header a <button> with no
 * onClick, and in the office top bar a link to /live — the live map, which is
 * not a notification list. The badge counted real alerts, so the app was
 * telling people there were 343 things to look at and then refusing to show
 * them.
 *
 * The list loads when the bell is OPENED, not on every page render. The admin
 * side was already making far too many server round trips per navigation; a
 * panel nobody has opened should not add another.
 */
const ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE = {
  critical: "text-rose-600 bg-rose-50",
  warning: "text-amber-600 bg-amber-50",
  info: "text-sky-600 bg-sky-50",
} as const;

function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function NotificationBell({
  audience,
  initialCount = 0,
  tone = "office",
}: {
  audience: Audience;
  initialCount?: number;
  tone?: "office" | "driver";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [unread, setUnread] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const open_ = useCallback(async () => {
    setOpen(true);
    if (items) return;
    setBusy(true);
    try {
      const feed = await loadNotifications(audience);
      setItems(feed.items);
      setUnread(feed.unread);
    } catch {
      setItems([]);
    } finally {
      setBusy(false);
    }
  }, [audience, items]);

  // Close on outside click and on Escape — a panel you cannot dismiss is worse
  // than no panel, especially on a phone with no obvious "away" to tap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead() {
    setUnread(0);
    setItems((cur) => cur?.map((i) => ({ ...i, read: true })) ?? cur);
    try { await markNotificationsRead(audience); } catch { /* the badge reappears on reload */ }
  }

  const driverStyle = tone === "driver";
  const btnClass = driverStyle
    ? "relative h-11 w-11 rounded-2xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-700 active:scale-95 transition-all"
    : "relative h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void open_())}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className={btnClass}
      >
        <Bell className={driverStyle ? "h-5 w-5" : "h-[18px] w-[18px]"} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* On a phone the panel is nearly full-width, so a backdrop makes the
              "tap away to close" gesture discoverable. */}
          <div className="fixed inset-0 z-40 bg-ink-950/20 sm:hidden sm:bg-transparent" onClick={() => setOpen(false)} />
          {/* On a phone the panel is pinned to the viewport, not to the bell.
              Anchoring it to the bell pushed it off the left edge — the bell is
              not the rightmost control, so a 22rem panel hanging from its right
              edge started at a negative x and cut off its own heading. */}
          <div
            className="fixed inset-x-3 top-[4.5rem] z-50 rounded-2xl border border-ink-200 bg-white shadow-2xl overflow-hidden
                       sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-100">
              <p className="text-sm font-bold text-ink-900">
                Notifications{unread > 0 && <span className="text-ink-400 font-medium"> · {unread} new</span>}
              </p>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => void markRead()}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="h-7 w-7 rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-900 flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
              {busy && (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              )}

              {!busy && items && items.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-ink-700">Nothing needs you right now</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {audience === "driver"
                      ? "Anything about you or your vehicle will appear here."
                      : "Expiring documents, services due and reported faults appear here."}
                  </p>
                </div>
              )}

              {!busy && items?.map((n) => {
                const Icon = ICON[n.severity];
                const inner = (
                  <div className={`flex gap-3 px-4 py-3 ${n.read ? "" : "bg-orange-50/40"}`}>
                    <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${TONE[n.severity]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink-900 leading-snug">{n.title}</span>
                      {n.body && <span className="block text-xs text-ink-500 leading-snug mt-0.5">{n.body}</span>}
                      <span className="block text-[10px] uppercase tracking-wide text-ink-400 mt-1">{when(n.at)}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
                  </div>
                );
                return n.href ? (
                  <Link
                    key={n.id}
                    href={n.href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    className="block border-b border-ink-50 last:border-0 hover:bg-ink-50/60"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} className="border-b border-ink-50 last:border-0">{inner}</div>
                );
              })}
            </div>

            {audience === "office" && (
              <Link
                href="/live"
                prefetch={false}
                onClick={() => setOpen(false)}
                className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-semibold text-orange-600 hover:bg-orange-50"
              >
                Open the live board
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
