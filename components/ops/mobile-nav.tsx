"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface MobileNavState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const MobileNavContext = createContext<MobileNavState>({ open: false, setOpen: () => {} });

export function useMobileNav() {
  return useContext(MobileNavContext);
}

/**
 * Holds the mobile sidebar drawer's open/closed state so the hamburger (in the
 * top bar) and the drawer (in the sidebar column) can coordinate across
 * separate components. On desktop (lg+) the sidebar is always visible and this
 * state is simply ignored.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (i.e. a nav link was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent the page behind the drawer from scrolling while it's open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
  );
}
