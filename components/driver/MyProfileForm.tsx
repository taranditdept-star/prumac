"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Loader2, ShieldCheck } from "lucide-react";
import { updateMyDriverProfile } from "@/actions/my-profile";
import { ZW_LICENCE_CLASSES, ZA_LICENCE_CLASSES } from "@/lib/validation/driver";

export interface MyProfile {
  full_name: string | null;
  phone: string | null;
  employee_number: string | null;
  licence_number: string;
  licence_country: "ZW" | "ZA";
  licence_classes: string[];
  licence_issued_at: string | null;
  licence_expires_at: string | null;
  defensive_driving_cert_at: string | null;
  medical_cert_expires_at: string | null;
  home_address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
}

const PENDING = "IMPORT-PENDING";

export function MyProfileForm({ profile }: { profile: MyProfile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [country, setCountry] = useState<"ZW" | "ZA">(profile.licence_country ?? "ZW");
  const [classes, setClasses] = useState<string[]>(profile.licence_classes ?? []);

  const options = country === "ZA" ? ZA_LICENCE_CLASSES : ZW_LICENCE_CLASSES;

  function toggle(c: string) {
    setClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function changeCountry(c: "ZW" | "ZA") {
    setCountry(c);
    const allowed: readonly string[] = c === "ZA" ? ZA_LICENCE_CLASSES : ZW_LICENCE_CLASSES;
    setClasses((prev) => prev.filter((x) => allowed.includes(x)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("licence_classes");
    classes.forEach((c) => fd.append("licence_classes", c));
    startTransition(async () => {
      const r = await updateMyDriverProfile(fd);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Your details are saved");
        router.refresh();
      }
    });
  }

  const input =
    "h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/25";
  const label = "block text-xs font-bold uppercase tracking-wide text-ink-500";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* You */}
      <section className="rounded-2xl border border-ink-200/70 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-ink-900">Your details</p>

        <label className="block">
          <span className={label}>Full name *</span>
          <input name="full_name" defaultValue={profile.full_name ?? ""} required className={`mt-1 ${input}`} />
        </label>

        <label className="block">
          <span className={label}>Phone number *</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="0771 234 567"
            required
            className={`mt-1 ${input} font-plate`}
          />
          <span className="mt-1 block text-[11px] text-ink-400">The office uses this to reach you.</span>
        </label>

        {profile.employee_number && (
          <div>
            <span className={label}>Driver ID</span>
            <p className="mt-1 flex h-12 items-center rounded-xl bg-ink-50 px-3.5 font-plate text-base font-bold text-ink-600">
              {profile.employee_number}
            </p>
            <span className="mt-1 block text-[11px] text-ink-400">
              This is your sign-in name — only the office can change it.
            </span>
          </div>
        )}
      </section>

      {/* Licence */}
      <section className="rounded-2xl border border-ink-200/70 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-ink-900">Driver&rsquo;s licence</p>

        <div>
          <span className={label}>Issued in</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["ZW", "ZA"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => changeCountry(c)}
                className={`h-12 rounded-xl border text-sm font-bold transition-colors ${
                  country === c
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-ink-200 bg-white text-ink-600"
                }`}
              >
                {c === "ZW" ? "Zimbabwe" : "South Africa"}
              </button>
            ))}
          </div>
          <input type="hidden" name="licence_country" value={country} />
        </div>

        <label className="block">
          <span className={label}>Licence number *</span>
          <input
            name="licence_number"
            defaultValue={profile.licence_number === PENDING ? "" : profile.licence_number}
            placeholder={profile.licence_number === PENDING ? "Type your licence number" : undefined}
            required
            className={`mt-1 ${input} font-plate`}
          />
          {profile.licence_number === PENDING && (
            <span className="mt-1 block text-[11px] font-semibold text-amber-600">
              Not captured yet — please add it.
            </span>
          )}
        </label>

        <div>
          <span className={label}>Classes you hold</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {options.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`h-11 min-w-11 rounded-xl border px-3 text-sm font-bold transition-colors ${
                  classes.includes(c)
                    ? "border-orange-400 bg-orange-500 text-white"
                    : "border-ink-200 bg-white text-ink-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Issued on</span>
            <input type="date" name="licence_issued_at" defaultValue={profile.licence_issued_at ?? ""} className={`mt-1 ${input}`} />
          </label>
          <label className="block">
            <span className={label}>Expires</span>
            <input type="date" name="licence_expires_at" defaultValue={profile.licence_expires_at ?? ""} className={`mt-1 ${input}`} />
          </label>
        </div>
      </section>

      {/* Certificates */}
      <section className="rounded-2xl border border-ink-200/70 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-ink-900">Certificates</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Defensive driving</span>
            <input type="date" name="defensive_driving_cert_at" defaultValue={profile.defensive_driving_cert_at ?? ""} className={`mt-1 ${input}`} />
          </label>
          <label className="block">
            <span className={label}>Medical expires</span>
            <input type="date" name="medical_cert_expires_at" defaultValue={profile.medical_cert_expires_at ?? ""} className={`mt-1 ${input}`} />
          </label>
        </div>
      </section>

      {/* Contact / emergency */}
      <section className="rounded-2xl border border-ink-200/70 bg-white p-4 space-y-3">
        <p className="text-sm font-bold text-ink-900">Home &amp; next of kin</p>
        <label className="block">
          <span className={label}>Home address</span>
          <textarea
            name="home_address"
            defaultValue={profile.home_address ?? ""}
            rows={2}
            className="mt-1 w-full resize-none rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-base text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Next of kin</span>
            <input name="next_of_kin_name" defaultValue={profile.next_of_kin_name ?? ""} className={`mt-1 ${input}`} />
          </label>
          <label className="block">
            <span className={label}>Their phone</span>
            <input
              name="next_of_kin_phone"
              type="tel"
              inputMode="tel"
              defaultValue={profile.next_of_kin_phone ?? ""}
              className={`mt-1 ${input} font-plate`}
            />
          </label>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-ink-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Used only if there is an emergency while you are on duty.
        </p>
      </section>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        {isPending ? "Saving…" : "Save my details"}
      </button>
    </form>
  );
}
