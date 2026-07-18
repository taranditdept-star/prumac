"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  MapPin,
  Truck,
  Users,
  Receipt,
  AlertTriangle,
  AlertOctagon,
  Wrench,
  BarChart3,
  FileText,
  ClipboardCheck,
  Fuel,
  CalendarClock,
  Package,
  CircleDot,
  Trophy,
  CalendarDays,
  Banknote,
  ScrollText,
  ArrowLeftRight,
  Settings,
  UserCog,
  ClipboardList,
  CalendarCheck,
} from "lucide-react";
import type { AppRole } from "@/types/domain";

const ALL = ["fleet_manager", "admin"] as const;

const SECTIONS = [
  {
    title: "Operations",
    items: [
      { href: "/live", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
      { href: "/live/map", label: "Live Map", icon: MapPin, roles: ALL },
      { href: "/trips", label: "Trips", icon: Map, roles: ALL },
      { href: "/trips/log", label: "Log mileage", icon: ClipboardList, roles: ALL },
    ],
  },
  {
    title: "Fleet & drivers",
    items: [
      { href: "/vehicles", label: "Vehicles", icon: Truck, roles: ALL },
      { href: "/drivers", label: "Drivers", icon: Users, roles: ALL },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ALL },
      { href: "/drivers/scorecards", label: "Scorecards", icon: Trophy, roles: ALL },
      { href: "/drivers/leave", label: "Leave", icon: CalendarDays, roles: ALL },
      { href: "/handovers", label: "Handovers", icon: ArrowLeftRight, roles: ALL },
    ],
  },
  {
    title: "Maintenance",
    items: [
      { href: "/maintenance", label: "Maintenance", icon: Wrench, roles: ALL },
      { href: "/maintenance/schedule", label: "Service schedule", icon: CalendarClock, roles: ALL },
      { href: "/fuel", label: "Fuel", icon: Fuel, roles: ALL },
      { href: "/parts", label: "Parts & inventory", icon: Package, roles: ALL },
      { href: "/tyres", label: "Tyres", icon: CircleDot, roles: ALL },
    ],
  },
  {
    title: "Safety & compliance",
    items: [
      { href: "/inspections", label: "Inspections", icon: ClipboardCheck, roles: ALL },
      { href: "/faults", label: "Faults", icon: AlertTriangle, roles: ALL },
      { href: "/accidents", label: "Accidents", icon: AlertOctagon, roles: ALL },
      { href: "/reconciliation", label: "Reconciliation", icon: FileText, roles: ALL },
    ],
  },
  {
    title: "Finance & admin",
    items: [
      { href: "/invoices", label: "Invoices", icon: Receipt, roles: ALL },
      { href: "/repairs", label: "Repair claims", icon: Wrench, roles: ALL },
      { href: "/vehicles/lifecycle", label: "Depreciation", icon: Banknote, roles: ALL },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
      { href: "/audit", label: "Audit log", icon: ScrollText, roles: ["admin"] },
      { href: "/admin/users", label: "Accounts", icon: UserCog, roles: ["admin"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
] as const;

interface NavLinkProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
}

function NavLink({ href, label, icon: Icon, active }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-orange-500" />
      )}
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-orange-400" : ""}`}
        strokeWidth={active ? 2.5 : 2}
      />
      <span>{label}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse-ring" />
      )}
    </Link>
  );
}

export function OpsNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    // Exact-match parents that also have child routes in the nav.
    if (href === "/live" || href === "/maintenance" || href === "/drivers" || href === "/vehicles" || href === "/trips")
      return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const sections = SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter((i) => (i.roles as readonly string[]).includes(role)),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex flex-col gap-5 px-3">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
