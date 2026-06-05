"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface EditDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;
}

export function EditDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = "w-full max-w-2xl",
}: EditDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-sm"
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className={`fixed inset-y-0 right-0 z-50 ${widthClass} bg-white shadow-2xl flex flex-col`}
            role="dialog"
            aria-modal="true"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 border-b border-ink-200 bg-white/95 backdrop-blur">
              <div>
                <h2 className="text-lg font-bold text-ink-900">{title}</h2>
                {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="h-9 w-9 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 hover:text-ink-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
