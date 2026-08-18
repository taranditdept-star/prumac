import { requireRole } from "@/lib/auth/session";
import { getUnresolvedAlertCount } from "@/lib/ops/alert-count";
import { OpsNav } from "@/components/ops/OpsNav";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";
import { ManagerAlerting } from "@/components/ops/ManagerAlerting";
import { MobileNavProvider } from "@/components/ops/mobile-nav";
import { SidebarDrawer } from "@/components/ops/SidebarDrawer";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("fleet_manager", "admin");
  const count = await getUnresolvedAlertCount();

  return (
    <MobileNavProvider>
      <div className="min-h-screen flex bg-[#f5f7fb]">
        <SidebarDrawer>
          <OpsSidebar profile={profile}>
            <OpsNav role={profile.role} />
          </OpsSidebar>
        </SidebarDrawer>
        <div className="flex-1 flex flex-col min-w-0">
          <OpsTopBar profile={profile} alertCount={count} />
          {/* pb-24 keeps the last row clear of the floating chat bubble, which
              sits bottom-right and was covering content on phones. */}
          <main className="flex-1 pb-24 md:pb-0">{children}</main>
        </div>
        <ManagerAlerting />
        <ChatWidget currentProfileId={profile.id} currentName={profile.full_name ?? "You"} />
      </div>
    </MobileNavProvider>
  );
}
