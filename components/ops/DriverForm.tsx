"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDriver, updateDriver } from "@/actions/drivers";
import { LICENCE_CLASSES } from "@/lib/validation/driver";
import type { DriverRow } from "@/types/domain";

interface SubsidiaryOption {
  id: string;
  name: string;
}

interface DriverFormProps {
  driver?: DriverRow & { profile?: { full_name: string | null; phone: string | null; subsidiary_id: string | null } };
  subsidiaries: SubsidiaryOption[];
}

export function DriverForm({ driver, subsidiaries }: DriverFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [classes, setClasses] = useState<string[]>(driver?.licence_classes ?? []);
  const isEdit = !!driver;

  function toggleClass(c: string) {
    setClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("licence_classes");
    classes.forEach((c) => fd.append("licence_classes", c));

    startTransition(async () => {
      try {
        const action = isEdit ? updateDriver : createDriver;
        const result = await action(fd);
        if (result && "error" in result) {
          toast.error(result.error);
        } else if (result && "success" in result) {
          toast.success("Driver saved");
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
          toast.error(err.message);
        }
      }
    });
  }

  const inputCls =
    "h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isEdit && <input type="hidden" name="id" value={driver.id} />}

      {/* Personal info */}
      <Section title="Personal information" subtitle="Identity and contact details">
        <Field label="Full name" required>
          <input
            name="full_name"
            defaultValue={driver?.profile?.full_name ?? ""}
            placeholder="Blessing Shumba"
            className={inputCls}
            required
          />
        </Field>
        {!isEdit && (
          <Field label="Phone number" required hint="Used for driver login via OTP">
            <input
              name="phone"
              type="tel"
              placeholder="+263 77 123 4567"
              className={inputCls + " font-plate"}
              required
            />
          </Field>
        )}
        {!isEdit && (
          <Field label="Email" hint="Optional — for password sign-in fallback">
            <input
              name="email"
              type="email"
              placeholder="driver@example.com"
              className={inputCls}
            />
          </Field>
        )}
        <Field label="Employee number">
          <input
            name="employee_number"
            defaultValue={driver?.employee_number ?? ""}
            placeholder="EMP-001"
            className={inputCls + " font-plate"}
          />
        </Field>
        <Field label="Home subsidiary">
          <select
            name="subsidiary_id"
            defaultValue={driver?.profile?.subsidiary_id ?? ""}
            className={selectCls}
          >
            <option value="">— none —</option>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Licence */}
      <Section title="Licence" subtitle="Driver's licence credentials and validity">
        <Field label="Licence number" required>
          <input
            name="licence_number"
            defaultValue={driver?.licence_number ?? ""}
            placeholder="ZW-123456789"
            className={inputCls + " font-plate"}
            required
          />
        </Field>
        <Field label="Country of issue" required>
          <select
            name="licence_country"
            defaultValue={driver?.licence_country ?? "ZW"}
            className={selectCls}
            required
          >
            <option value="ZW">Zimbabwe (ZW)</option>
            <option value="ZA">South Africa (ZA)</option>
          </select>
        </Field>
        <Field label="Issued" full>
          <input
            name="licence_issued_at"
            type="date"
            defaultValue={driver?.licence_issued_at ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Expires" required full>
          <input
            name="licence_expires_at"
            type="date"
            defaultValue={driver?.licence_expires_at ?? ""}
            className={inputCls}
            required
          />
        </Field>

        <div className="md:col-span-2">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Licence classes
          </Label>
          <p className="text-xs text-ink-400 mt-0.5 mb-3">
            Tap each class the driver is endorsed for.
          </p>
          <div className="flex flex-wrap gap-2">
            {LICENCE_CLASSES.map((c) => {
              const on = classes.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleClass(c)}
                  className={`h-9 px-3.5 rounded-xl border text-sm font-plate font-bold transition-all ${
                    on
                      ? "bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-200"
                      : "bg-white border-ink-200 text-ink-700 hover:border-orange-300"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Certifications */}
      <Section title="Certifications" subtitle="Optional certificates and medical clearance">
        <Field label="Defensive driving cert.">
          <input
            name="defensive_driving_cert_at"
            type="date"
            defaultValue={driver?.defensive_driving_cert_at ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Medical cert. expires">
          <input
            name="medical_cert_expires_at"
            type="date"
            defaultValue={driver?.medical_cert_expires_at ?? ""}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Address & next of kin */}
      <Section title="Address & emergency contact" subtitle="For HR records and emergencies">
        <Field label="Home address" full>
          <textarea
            name="home_address"
            rows={2}
            defaultValue={driver?.home_address ?? ""}
            className={inputCls + " py-2.5 resize-none h-auto min-h-[64px]"}
          />
        </Field>
        <Field label="Next of kin name">
          <input
            name="next_of_kin_name"
            defaultValue={driver?.next_of_kin_name ?? ""}
            className={inputCls}
          />
        </Field>
        <Field label="Next of kin phone">
          <input
            name="next_of_kin_phone"
            type="tel"
            defaultValue={driver?.next_of_kin_phone ?? ""}
            className={inputCls + " font-plate"}
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 px-4 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          Cancel
        </button>
        <Button
          type="submit"
          disabled={isPending}
          className="h-10 px-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 transition-all"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create driver"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
      <div className="mb-5">
        <h2 className="text-base font-bold text-ink-900">{title}</h2>
        <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
        {required && <span className="text-orange-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-ink-400">{hint}</p>}
    </div>
  );
}
