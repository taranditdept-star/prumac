import { ChevronsUpDown } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import type { ProfileRow } from "@/types/domain";

interface OpsSidebarProps {
  profile: ProfileRow;
  children: React.ReactNode;
}

export function OpsSidebar({ profile, children }: OpsSidebarProps) {
  const initial = (profile.full_name ?? "A").charAt(0).toUpperCase();
  return (
    <aside className="w-[260px] h-screen bg-ink-950 text-slate-300 flex flex-col relative overflow-hidden">
      {/* Subtle gradient halo */}
      <div className="pointer-events-none absolute -top-32 -left-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -right-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />

      {/* Brand */}
      <div className="relative px-5 py-5 border-b border-white/5">
        <div className="inline-flex rounded-xl bg-white px-3 py-2.5 shadow-lg shadow-black/20">
          <Logo height={26} />
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto py-5">{children}</nav>

      {/* User chip */}
      <div className="relative border-t border-white/5 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors px-3 py-2.5 cursor-pointer">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white/10">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {profile.full_name ?? "User"}
            </p>
            <p className="text-[11px] text-slate-500 capitalize truncate">
              {profile.role.replace("_", " ")}
            </p>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-slate-500" />
        </div>
      </div>
    </aside>
  );
}
