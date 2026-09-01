import { requireDriverAccess } from "@/lib/auth/driver";

// Standalone layout (outside the driver tab-bar shell) so the onboarding gate
// in the driver layout can redirect here without looping.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireDriverAccess();
  return <div className="min-h-screen bg-[#f5f7fb]">{children}</div>;
}
