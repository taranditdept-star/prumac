import { UserCog } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { UserManagement, type AccountRow } from "@/components/ops/UserManagement";
import type { AppRole } from "@/types/domain";

export const dynamic = "force-dynamic";

const ROLE_ORDER: Record<AppRole, number> = {
  admin: 0,
  fleet_manager: 1,
  subsidiary_billing: 2,
  driver: 3,
};

export default async function UsersAdminPage() {
  await requireRole("admin");
  const service = createServiceClient();

  const [{ data: profiles }, { data: drivers }, { data: subs }] = await Promise.all([
    service
      .schema("app")
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .returns<{ id: string; full_name: string | null; email: string | null; role: AppRole; is_active: boolean | null }[]>(),
    service
      .schema("app")
      .from("drivers")
      .select("profile_id, employee_number, licence_number, is_active")
      .returns<{ profile_id: string; employee_number: string | null; licence_number: string; is_active: boolean | null }[]>(),
    service.schema("app").from("subsidiaries").select("id, name").order("name"),
  ]);

  const driverByProfile = new Map((drivers ?? []).map((d) => [d.profile_id, d]));

  const accounts: AccountRow[] = (profiles ?? [])
    .map((p) => {
      const d = driverByProfile.get(p.id);
      return {
        id: p.id,
        name: p.full_name ?? "Unnamed",
        role: p.role,
        identifier: d?.employee_number ?? p.email ?? "—",
        active: p.is_active !== false,
        onboardingPending: d?.licence_number === "IMPORT-PENDING",
        isDriver: !!d || p.role === "driver",
      };
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <UserCog className="h-6 w-6 text-orange-400" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Accounts</h1>
            <p className="text-sm text-slate-300">Create logins, reset passwords, and deactivate users.</p>
          </div>
        </div>
      </div>

      <UserManagement accounts={accounts} subsidiaries={subs ?? []} />
    </div>
  );
}
