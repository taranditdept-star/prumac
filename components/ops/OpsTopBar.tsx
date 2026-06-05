"use client";

import { useTransition } from "react";
import { Search, Bell, LogOut, HelpCircle, Plus } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/actions/auth";
import type { ProfileRow } from "@/types/domain";

export function OpsTopBar({ profile }: { profile: ProfileRow }) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut();
      if (result && "redirectTo" in result) window.location.href = result.redirectTo;
    });
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center justify-between px-6 lg:px-8 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search vehicles, drivers, trips…"
            className="h-10 w-full rounded-xl border border-ink-200 bg-ink-50 pl-10 pr-12 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:bg-white focus:border-orange-500/40 transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-0.5 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
            ⌘K
          </kbd>
        </div>
      </div>

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

        <button
          type="button"
          aria-label="Notifications"
          className="relative h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

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
