"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, Scale, BookOpen, Users, Building2,
  ListTree, NotebookPen, ArrowLeft, Receipt,
} from "lucide-react";
import type { AppRole } from "@/types/domain";

const REPORTS = [
  { href: "/finance", label: "Overview", icon: LayoutDashboard },
  { href: "/finance/pnl", label: "Profit & Loss", icon: TrendingUp },
  { href: "/finance/balance-sheet", label: "Balance Sheet", icon: Scale },
  { href: "/finance/cashbook", label: "Cashbook", icon: BookOpen },
] as const;

const LEDGERS = [
  { href: "/finance/debtors", label: "Debtors & Aging", icon: Users },
  { href: "/finance/creditors", label: "Creditors", icon: Building2 },
  { href: "/invoices", label: "Invoices", icon: Receipt },
] as const;

const SETUP = [
  { href: "/finance/accounts", label: "Chart of Accounts", icon: ListTree },
  { href: "/finance/journal", label: "General Journal", icon: NotebookPen },
] as const;

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean; }) {
  return (
    <Link href={href} className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${active ? "bg-gradient-to-r from-orange-500/15 to-orange-500/5 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-orange-500" />}
      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-orange-400" : ""}`} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}

function Section({ title, items, isActive }: { title: string; items: readonly { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[]; isActive: (h: string) => boolean; }) {
  return (
    <div className="mb-4">
      <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="space-y-0.5">
        {items.map((i) => <NavLink key={i.href} {...i} active={isActive(i.href)} />)}
      </div>
    </div>
  );
}

export function FinanceNav({ role: _role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/finance" ? pathname === "/finance" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <div className="flex flex-col gap-1 px-3">
      <div className="mb-4">
        <Link href="/live" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all">
          <ArrowLeft className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
          <span>Back to operations</span>
        </Link>
      </div>
      <Section title="Reports" items={REPORTS} isActive={isActive} />
      <Section title="Ledgers" items={LEDGERS} isActive={isActive} />
      <Section title="Setup" items={SETUP} isActive={isActive} />
    </div>
  );
}
