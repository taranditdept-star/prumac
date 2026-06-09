"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, LogOut, Phone, IdCard, X, ShieldCheck } from "lucide-react";
import { signOut } from "@/actions/auth";
import { Logo } from "@/components/brand/Logo";

interface DriverHeaderProps {
  fullName: string | null;
  phone: string | null;
  licenceNumber?: string | null;
  licenceCountry?: string | null;
  initial: string;
  gradient: string;
  greeting: string;
  alertCount?: number;
}

export function DriverHeader({
  fullName,
  phone,
  licenceNumber,
  licenceCountry,
  initial,
  gradient,
  greeting,
  alertCount = 0,
}: DriverHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOut();
      if (result && "redirectTo" in result) window.location.href = result.redirectTo;
    });
  }

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-ink-100/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Avatar + greeting */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-3 min-w-0 active:opacity-70 transition-opacity"
            aria-label="Open profile menu"
          >
            <div
              className={`h-11 w-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white shadow-md`}
            >
              {initial}
            </div>
            <div className="text-left min-w-0">
              <p className="text-[11px] text-ink-500 leading-none">{greeting}</p>
              <p className="text-sm font-bold text-ink-900 truncate mt-0.5">
                {fullName ?? "Driver"}
              </p>
            </div>
          </button>

          {/* Right-side actions */}
          <div className="flex items-center gap-2">
            {/* Bell */}
            <button
              type="button"
              aria-label="Notifications"
              className="relative h-11 w-11 rounded-2xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-700 active:scale-95 transition-all"
            >
              <Bell className="h-5 w-5" />
              {alertCount > 0 && (
                <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white" />
              )}
            </button>

            {/* Sign out */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isPending}
              aria-label="Sign out"
              title="Sign out"
              className="h-11 w-11 rounded-2xl bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-600 active:scale-95 transition-all disabled:opacity-50"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Profile sheet */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <span className="h-1.5 w-12 rounded-full bg-ink-200" />
              </div>

              {/* Profile */}
              <div className="px-5 pt-4 pb-6">
                <div className="flex items-center gap-4">
                  <div
                    className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-white shadow-lg`}
                  >
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-ink-900 truncate">
                      {fullName ?? "Driver"}
                    </p>
                    <div className="inline-flex items-center gap-1.5 mt-1 rounded-full bg-emerald-50 px-2.5 py-0.5">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-bold">
                        Active driver
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setMenuOpen(false)}
                    className="h-10 w-10 rounded-xl bg-ink-50 hover:bg-ink-100 flex items-center justify-center text-ink-500 active:scale-95 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Info list */}
                <div className="mt-6 space-y-2">
                  {phone && (
                    <InfoRow icon={Phone} label="Phone" value={phone} mono />
                  )}
                  {licenceNumber && (
                    <InfoRow
                      icon={IdCard}
                      label="Licence"
                      value={`${licenceCountry ?? "ZW"} · ${licenceNumber}`}
                      mono
                    />
                  )}
                </div>

                {/* Sign out */}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isPending}
                  className="mt-6 w-full h-14 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 font-bold text-base inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <LogOut className="h-5 w-5" />
                  {isPending ? "Signing out…" : "Sign out"}
                </button>

                <div className="flex items-center justify-center gap-2 mt-5 opacity-80">
                  <Logo height={20} />
                  <span className="text-[10px] text-ink-400">· v1.0</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink-50 px-4 py-3">
      <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center text-ink-600 shrink-0 ring-1 ring-ink-200">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
        <p className={`text-sm font-semibold text-ink-900 truncate mt-0.5 ${mono ? "font-plate" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
