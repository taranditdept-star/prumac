import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OpsNav } from "@/components/ops/OpsNav";
import { OpsSidebar } from "@/components/ops/OpsSidebar";
import { OpsTopBar } from "@/components/ops/OpsTopBar";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { count } = await supabase
    .schema("app")
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      <div className="sticky top-0 h-screen shrink-0 z-40">
        <OpsSidebar profile={profile}>
          <OpsNav role={profile.role} />
        </OpsSidebar>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <OpsTopBar profile={profile} alertCount={count ?? 0} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
