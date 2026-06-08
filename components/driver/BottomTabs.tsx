"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardCheck, ArrowLeftRight, AlertOctagon, Play, Navigation } from "lucide-react";

/**
 * Clean, contained 5-tab bottom navigation — no protruding floating button (the
 * old centre FAB overlapped form fields and submit buttons). The centre "Start"
 * tab is emphasised and context-aware (Manage trip when one is active). Sticky
 * to the bottom with safe-area padding so it never sits under the home bar.
 */
export function DriverBottomTabs({ activeTripId }: { activeTripId?: string | null }) {
  const pathname = usePathname();
  const onTrip = Boolean(activeTripId);

  const left = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
  ];
  const right = [
    { href: "/handover", label: "Handover", icon: ArrowLeftRight },
    { href: "/accident/new", label: "Accident", icon: AlertOctagon },
  ];

  const isActive = (href: string) =>
    href === "/home" ? pathname === "/home" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-ink-100 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="grid grid-cols-5 items-end h-16 max-w-md mx-auto px-1">
        {left.map((t) => <Tab key={t.href} {...t} active={isActive(t.href)} />)}

        {/* Centre: Start / Manage trip — emphasised but contained */}
        <Link
          href={onTrip ? `/trip/${activeTripId}` : "/trip/start"}
          aria-label={onTrip ? "Manage current trip" : "Start trip"}
          className="flex flex-col items-center justify-end gap-1 h-full pb-1.5"
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md transition-transform active:scale-95 ${
              onTrip ? "bg-emerald-500 shadow-emerald-500/30" : "bg-orange-500 shadow-orange-500/30"
            }`}
          >
            {onTrip ? <Navigation className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" fill="currentColor" />}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${onTrip ? "text-emerald-600" : "text-orange-600"}`}>
            {onTrip ? "Trip" : "Start"}
          </span>
        </Link>

        {right.map((t) => <Tab key={t.href} {...t} active={isActive(t.href)} />)}
      </div>
    </nav>
  );
}

function Tab({
  href, label, icon: Icon, active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-end gap-1 h-full pb-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active ? "text-orange-600" : "text-ink-400"
      }`}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />
      <span>{label}</span>
    </Link>
  );
}
