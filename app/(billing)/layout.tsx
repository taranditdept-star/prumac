import { requireRole } from "@/lib/auth/session";
import { BillingNav } from "@/components/billing/BillingNav";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("subsidiary_billing", "fleet_manager", "admin");

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      <div className="sticky top-0 h-screen shrink-0 z-40">
        <OpsSidebar profile={profile}>
          <BillingNav role={profile.role} />
        </OpsSidebar>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <OpsTopBar profile={profile} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
