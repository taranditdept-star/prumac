import { requireRole } from "@/lib/auth/session";
import { getUnresolvedAlertCount } from "@/lib/ops/alert-count";
import { BillingNav } from "@/components/billing/BillingNav";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";
import { ManagerAlerting } from "@/components/ops/ManagerAlerting";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("subsidiary_billing", "fleet_manager", "admin");
  const count = await getUnresolvedAlertCount();

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      <div className="sticky top-0 h-screen shrink-0 z-40">
        <OpsSidebar profile={profile}>
          <BillingNav role={profile.role} />
        </OpsSidebar>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <OpsTopBar profile={profile} alertCount={count} />
        <main className="flex-1">{children}</main>
      </div>
      <ManagerAlerting />
    </div>
  );
}
