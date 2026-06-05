import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriverBottomTabs } from "@/components/driver/BottomTabs";
import { DriverHeader } from "@/components/driver/DriverHeader";

const GRADIENTS = [
  "from-orange-400 to-pink-500",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-violet-400 to-purple-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-red-600",
];

function gradientFor(name: string | null): string {
  if (!name) return GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function initialOf(name: string | null): string {
  if (!name) return "D";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function greetingFor(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole("driver");
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("licence_number, licence_country")
    .eq("profile_id", profile.id)
    .maybeSingle<{ licence_number: string; licence_country: string }>();

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f7fb]">
      <DriverHeader
        fullName={profile.full_name}
        phone={profile.phone}
        licenceNumber={driver?.licence_number}
        licenceCountry={driver?.licence_country}
        initial={initialOf(profile.full_name)}
        gradient={gradientFor(profile.full_name)}
        greeting={greetingFor()}
      />
      <main className="flex-1 overflow-y-auto pb-32">{children}</main>
      <DriverBottomTabs />
    </div>
  );
}
