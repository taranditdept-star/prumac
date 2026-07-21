import { requireRole } from "@/lib/auth/session";
import { getUnresolvedAlertCount } from "@/lib/ops/alert-count";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";
import { ManagerAlerting } from "@/components/ops/ManagerAlerting";
import { MobileNavProvider } from "@/components/ops/mobile-nav";
import { SidebarDrawer } from "@/components/ops/SidebarDrawer";
import { FinanceNav } from "@/components/finance/FinanceNav";

// Finance is management-level: managers + admins only (never drivers, and not
// the external subsidiary-billing contacts — company financials are confidential).
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("fleet_manager", "admin");
  const count = await getUnresolvedAlertCount();

  return (
    <MobileNavProvider>
      <div className="min-h-screen flex bg-[#f5f7fb]">
        <SidebarDrawer>
          <OpsSidebar profile={profile}>
            <FinanceNav role={profile.role} />
          </OpsSidebar>
        </SidebarDrawer>
        <div className="flex-1 flex flex-col min-w-0">
          <OpsTopBar profile={profile} alertCount={count} />
          <main className="flex-1">{children}</main>
        </div>
        <ManagerAlerting />
      </div>
    </MobileNavProvider>
  );
}
