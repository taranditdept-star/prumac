import { requireRole } from "@/lib/auth/session";
import { getUnresolvedAlertCount } from "@/lib/ops/alert-count";
import { OpsNav } from "@/components/ops/OpsNav";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("fleet_manager", "admin");
  const count = await getUnresolvedAlertCount();

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      <div className="sticky top-0 h-screen shrink-0 z-40">
        <OpsSidebar profile={profile}>
          <OpsNav role={profile.role} />
        </OpsSidebar>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <OpsTopBar profile={profile} alertCount={count} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
