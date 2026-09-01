"use client";

import { useTransition } from "react";
import { LogOut, Plus, Menu, Truck } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/actions/auth";
import { GlobalSearch } from "@/components/ops/GlobalSearch";
import { useMobileNav } from "@/components/ops/mobile-nav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { ProfileRow } from "@/types/domain";

export function OpsTopBar({
  profile,
  alertCount = 0,
  canDrive = false,
}: {
  profile: ProfileRow;
  alertCount?: number;
  canDrive?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { setOpen } = useMobileNav();

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut();
      if (result && "redirectTo" in result) window.location.href = result.redirectTo;
    });
  }

  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-ink-200/70 bg-white/80 backdrop-blur-xl">
      {/* Hamburger — opens the sidebar drawer on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="lg:hidden mr-2 -ml-1 h-10 w-10 shrink-0 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-600 transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

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

        {/* Someone who drives as well as running the office needs a door into
            the driver app; their role sends them here at login and nothing
            else leads back. Only rendered when they actually have a driver
            record, so it never appears for office-only staff. */}
        {canDrive && (
          <Link
            href="/home"
            prefetch={false}
            aria-label="Switch to the driver app"
            title="Driver app"
            className="h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors"
          >
            <Truck className="h-[18px] w-[18px]" />
          </Link>
        )}

        <NotificationBell audience="office" initialCount={alertCount} />

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
