"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, Plus, Wifi, Bell, Zap } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Re-prompt every session (sessionStorage), but a hard "Don't show again"
// suppresses it for good (localStorage).
const SESSION_KEY = "pwa-install-dismissed-session";
const FOREVER_KEY = "pwa-install-dismissed";

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
    if (standalone) return; // already installed — nothing to do
    if (localStorage.getItem(FOREVER_KEY) === "1") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (ios) {
      // iOS gives no install event; Safari requires a manual Add to Home Screen.
      setIsIOS(true);
      setVisible(true);
      return;
    }

    // Android/desktop: wait for the browser's install signal, then show.
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

  function later() {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, "1");
  }

  function never() {
    setVisible(false);
    localStorage.setItem(FOREVER_KEY, "1");
  }

  async function install() {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setVisible(false);
    if (choice.outcome !== "accepted") sessionStorage.setItem(SESSION_KEY, "1");
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
        onClick={later}
        aria-hidden
      />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={later}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>

        {showIOSHelp ? (
          <div className="p-6">
            <span className="inline-flex rounded-xl bg-white px-3 py-2 ring-1 ring-ink-100">
              <Logo height={20} />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-ink-900">Add to Home Screen</h2>
            <p className="mt-1 text-sm text-ink-500">Two quick taps in Safari:</p>
            <ol className="mt-4 space-y-3">
              <li className="flex items-center gap-3 rounded-2xl bg-ink-50 px-4 py-3">
                <Share className="h-5 w-5 shrink-0 text-sky-500" />
                <span className="text-sm text-ink-800">
                  Tap the <b>Share</b> button at the bottom of Safari
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-ink-50 px-4 py-3">
                <Plus className="h-5 w-5 shrink-0 text-emerald-500" />
                <span className="text-sm text-ink-800">
                  Choose <b>Add to Home Screen</b>, then <b>Add</b>
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={later}
              className="mt-5 h-12 w-full rounded-2xl bg-ink-900 text-sm font-bold text-white hover:bg-ink-800"
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 px-6 pb-7 pt-8 text-center">
              <span className="inline-flex rounded-2xl bg-white px-4 py-2.5 shadow-lg">
                <Logo height={26} />
              </span>
              <h2 className="mt-4 text-xl font-extrabold text-white">Install PRUMAC Connect</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm text-white/85">
                Add it to your home screen and open it like a normal app — full screen, faster, and always one tap away.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Benefit icon={Zap} label="Instant launch" />
                <Benefit icon={Bell} label="Emergency alerts" />
                <Benefit icon={Wifi} label="Works offline" />
              </div>

              <button
                type="button"
                onClick={install}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 py-3.5 text-base font-bold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700 active:scale-[0.98]"
              >
                <Download className="h-5 w-5" />
                {isIOS ? "Add to Home Screen" : "Install app"}
              </button>
              <div className="mt-2 flex items-center justify-center gap-4">
                <button type="button" onClick={later} className="py-1.5 text-xs font-semibold text-ink-500 hover:text-ink-800">
                  Maybe later
                </button>
                <span className="text-ink-200">·</span>
                <button type="button" onClick={never} className="py-1.5 text-xs font-semibold text-ink-400 hover:text-ink-700">
                  Don&apos;t show again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Benefit({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-ink-50 px-2 py-3">
      <Icon className="h-5 w-5 text-orange-600" />
      <span className="text-[10px] font-semibold leading-tight text-ink-600">{label}</span>
    </div>
  );
}
