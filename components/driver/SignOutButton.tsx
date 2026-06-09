"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/actions/auth";

/**
 * Always-visible sign-out for drivers. The profile sheet (avatar tap) also has
 * one, but drivers couldn't find it — this surfaces it directly on the home
 * screen.
 */
export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut();
      if (result && "redirectTo" in result) window.location.href = result.redirectTo;
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="col-span-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-base font-bold text-rose-700 transition-colors hover:bg-rose-100 active:scale-[0.98] active:bg-rose-200 disabled:opacity-50"
    >
      <LogOut className="h-5 w-5" />
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
