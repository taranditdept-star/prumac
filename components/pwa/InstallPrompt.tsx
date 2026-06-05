"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  async function install() {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-[76px] sm:bottom-3 z-[60] px-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-ink-950 text-white shadow-2xl ring-1 ring-white/10 overflow-hidden">
        {showIOSHelp ? (
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold">Add to Home Screen</p>
              <button onClick={dismiss} aria-label="Close" className="text-white/60 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-2 space-y-1.5 text-xs text-white/80">
              <li className="flex items-center gap-2">
                <Share className="h-4 w-4 text-sky-400 shrink-0" /> Tap the <b>Share</b> button in Safari
              </li>
              <li className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400 shrink-0" /> Choose <b>Add to Home Screen</b>
              </li>
            </ol>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3">
            <span className="rounded-lg bg-white px-2 py-1.5 shrink-0">
              <Logo height={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">Install the app</p>
              <p className="text-[11px] text-white/60 leading-tight mt-0.5">
                Add PRUMAC Connect to your home screen.
              </p>
            </div>
            <button
              onClick={install}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold active:scale-95 transition-all shrink-0"
            >
              <Download className="h-4 w-4" />
              Install
            </button>
            <button onClick={dismiss} aria-label="Dismiss" className="text-white/50 hover:text-white shrink-0 px-1">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
