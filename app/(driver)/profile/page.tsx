import Link from "next/link";
import { ArrowLeft, UserPen } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MyProfileForm, type MyProfile } from "@/components/driver/MyProfileForm";

export const dynamic = "force-dynamic";

interface DriverSelf {
  licence_number: string;
  licence_country: "ZW" | "ZA";
  licence_classes: string[] | null;
  licence_issued_at: string | null;
  licence_expires_at: string | null;
  defensive_driving_cert_at: string | null;
  medical_cert_expires_at: string | null;
  home_address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  employee_number: string | null;
}

export default async function DriverProfilePage() {
  const profile = await requireRole("driver");
  const supabase = await createClient();

  // Readable thanks to the drivers_read_self policy added in 0070.
  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select(`
      licence_number, licence_country, licence_classes, licence_issued_at, licence_expires_at,
      defensive_driving_cert_at, medical_cert_expires_at, home_address,
      next_of_kin_name, next_of_kin_phone, employee_number
    `)
    .eq("profile_id", profile.id)
    .maybeSingle<DriverSelf>();

  const data: MyProfile = {
    full_name: profile.full_name,
    phone: profile.phone,
    employee_number: driver?.employee_number ?? null,
    licence_number: driver?.licence_number ?? "",
    licence_country: driver?.licence_country ?? "ZW",
    licence_classes: driver?.licence_classes ?? [],
    licence_issued_at: driver?.licence_issued_at ?? null,
    licence_expires_at: driver?.licence_expires_at ?? null,
    defensive_driving_cert_at: driver?.defensive_driving_cert_at ?? null,
    medical_cert_expires_at: driver?.medical_cert_expires_at ?? null,
    home_address: driver?.home_address ?? null,
    next_of_kin_name: driver?.next_of_kin_name ?? null,
    next_of_kin_phone: driver?.next_of_kin_phone ?? null,
  };

  return (
    <div className="space-y-5 p-4 pt-6">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 py-1">
          <UserPen className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-700">My details</span>
        </div>
        <h1 className="text-2xl font-bold text-ink-900">Keep your details up to date</h1>
        <p className="mt-1 text-sm text-ink-500">
          The office uses these to reach you and to check your licence is valid.
        </p>
      </header>

      {!driver && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          We couldn&rsquo;t find your driver record. Please tell the office.
        </p>
      )}

      {driver && <MyProfileForm profile={data} />}
    </div>
  );
}
