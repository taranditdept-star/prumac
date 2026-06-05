"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Truck, Users, Map, MapPin,
  Receipt, FileText, ClipboardCheck, AlertTriangle, AlertOctagon, Wrench,
  DollarSign, Building, BarChart3,
} from "lucide-react";
import type { AppRole } from "@/types/domain";

const OPS = [
  { href: "/live", label: "Dashboard", icon: LayoutDashboard, roles: ["fleet_manager", "admin"] },
  { href: "/live/map", label: "Live Map", icon: MapPin, roles: ["fleet_manager", "admin"] },
  { href: "/trips", label: "Trips", icon: Map, roles: ["fleet_manager", "admin"] },
  { href: "/vehicles", label: "Vehicles", icon: Truck, roles: ["fleet_manager", "admin"] },
  { href: "/drivers", label: "Drivers", icon: Users, roles: ["fleet_manager", "admin"] },
] as const;

const FINANCE = [
  { href: "/invoices", label: "Invoices", icon: Receipt, roles: ["subsidiary_billing", "fleet_manager", "admin"] },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, roles: ["fleet_manager", "admin"] },
  { href: "/rates", label: "Rates", icon: DollarSign, roles: ["admin"] },
  { href: "/subsidiaries", label: "Subsidiaries", icon: Building, roles: ["admin"] },
] as const;

const MGMT = [
  { href: "/reconciliation", label: "Reconciliation", icon: FileText, roles: ["fleet_manager", "admin"] },
  { href: "/inspections", label: "Inspections", icon: ClipboardCheck, roles: ["fleet_manager", "admin"] },
  { href: "/faults", label: "Faults", icon: AlertTriangle, roles: ["fleet_manager", "admin"] },
  { href: "/accidents", label: "Accidents", icon: AlertOctagon, roles: ["fleet_manager", "admin"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
] as const;

function NavLink({
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
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-white"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-orange-500" />
      )}
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-orange-400" : ""}`} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}

export function BillingNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/live") return pathname === "/live";
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const ops = OPS.filter((i) => (i.roles as readonly string[]).includes(role));
  const finance = FINANCE.filter((i) => (i.roles as readonly string[]).includes(role));
  const mgmt = MGMT.filter((i) => (i.roles as readonly string[]).includes(role));

  return (
    <div className="flex flex-col gap-1 px-3">
      {ops.length > 0 && (
        <div className="mb-4">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Operations
          </p>
          <div className="space-y-0.5">
            {ops.map((item) => <NavLink key={item.href} {...item} active={isActive(item.href)} />)}
          </div>
        </div>
      )}
      <div className="mb-4">
        <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Finance
        </p>
        <div className="space-y-0.5">
          {finance.map((item) => <NavLink key={item.href} {...item} active={isActive(item.href)} />)}
        </div>
      </div>
      {mgmt.length > 0 && (
        <div>
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Management
          </p>
          <div className="space-y-0.5">
            {mgmt.map((item) => <NavLink key={item.href} {...item} active={isActive(item.href)} />)}
          </div>
        </div>
      )}
    </div>
  );
}
