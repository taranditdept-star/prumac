"use client";

import { useMobileNav } from "./mobile-nav";

/**
 * Positions the ops sidebar. On mobile it's an off-canvas drawer (slides in
 * over a dimmed backdrop); on lg+ it's a static, always-visible column in the
 * flex row. The visual sidebar itself (OpsSidebar) is passed as children.
 */
export function SidebarDrawer({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();

  return (
    <>
      {/* Dim backdrop — mobile only, tap to close */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sidebar: off-canvas drawer on mobile, sticky column on lg+ */}
      <div
        className={`fixed inset-y-0 left-0 z-50 h-screen shrink-0 transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-40 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </div>
    </>
  );
}
