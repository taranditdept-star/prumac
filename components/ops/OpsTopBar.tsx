"use client";

import { useTransition } from "react";
import { Bell, LogOut, HelpCircle, Plus } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/actions/auth";
import { GlobalSearch } from "@/components/ops/GlobalSearch";
import type { ProfileRow } from "@/types/domain";

export function OpsTopBar({ profile, alertCount = 0 }: { profile: ProfileRow; alertCount?: number }) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut();
      if (result && "redirectTo" in result) window.location.href = result.redirectTo;
    });
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center justify-between px-6 lg:px-8 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl">
      {/* Global search */}
      <GlobalSearch />

      <div className="flex items-center gap-2 ml-4">
        <Link
          href="/vehicles/new"
          className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-ink-900 text-white text-sm font-medium hover:bg-ink-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>

        <button
          type="button"
          aria-label="Help"
          className="h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>

        <Link
          href="/live"
          aria-label={`Notifications${alertCount ? ` (${alertCount} unresolved)` : ""}`}
          className="relative h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>

        <div className="h-6 w-px bg-ink-200 mx-1" />

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
          aria-label="Sign out"
          className="h-10 w-10 rounded-xl bg-ink-50 hover:bg-rose-50 flex items-center justify-center text-ink-500 hover:text-rose-600 transition-colors disabled:opacity-50"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
