"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardCheck, AlertOctagon, ArrowLeftRight, Play, Navigation } from "lucide-react";

const tabs = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
  // center slot reserved for the trip FAB
  { href: "/handover", label: "Handover", icon: ArrowLeftRight },
  { href: "/accident/new", label: "Accident", icon: AlertOctagon },
] as const;

export function DriverBottomTabs({ activeTripId }: { activeTripId?: string | null }) {
  const pathname = usePathname();

  // Mid-trip → the centre button manages the active trip (where End trip lives).
  const onTrip = Boolean(activeTripId);
  const fabHref = onTrip ? `/trip/${activeTripId}` : "/trip/start";
  const FabIcon = onTrip ? Navigation : Play;

  return (
    <>
      {/* Floating start / manage-trip FAB */}
      <Link
        href={fabHref}
        aria-label={onTrip ? "Manage current trip" : "Start trip"}
        className={`fixed bottom-[68px] left-1/2 -translate-x-1/2 z-50 h-16 w-16 rounded-full text-white flex items-center justify-center shadow-xl active:scale-95 transition-transform ring-4 ring-white ${
          onTrip
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/40"
            : "bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/40"
        }`}
      >
        <FabIcon className={`h-6 w-6 ${onTrip ? "" : "ml-0.5"}`} strokeWidth={2.5} fill={onTrip ? "none" : "currentColor"} />
      </Link>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink-100 z-40 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="grid grid-cols-5 items-center h-[64px]">
          {tabs.slice(0, 2).map((tab) => (
            <TabLink key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}
          {/* Centre column: label for the FAB */}
          <div className="flex flex-col items-center justify-end h-full pb-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${onTrip ? "text-emerald-600" : "text-orange-600"}`}>
              {onTrip ? "Trip" : "Start"}
            </span>
          </div>
          {tabs.slice(2).map((tab) => (
            <TabLink key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
          ))}
        </div>
      </nav>
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-0.5 h-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active ? "text-orange-600" : "text-ink-400 hover:text-ink-700"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}
