import { requireRole } from "@/lib/auth/session";

// Standalone layout (outside the driver tab-bar shell) so the onboarding gate
// in the driver layout can redirect here without looping.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireRole("driver");
  return <div className="min-h-screen bg-[#f5f7fb]">{children}</div>;
}
