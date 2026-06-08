"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { OcrButton } from "@/components/ocr/OcrButton";
import { submitRepairClaim } from "@/actions/repairs";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { SinglePhotoInput } from "@/components/primitives/SinglePhotoInput";
import { FormSection, FieldLabel, fieldClass, selectClass, textareaClass, SubmitButton } from "@/components/driver/FormKit";
import type { CountryCode } from "@/types/domain";

export interface RepairVehicle {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
  default_subsidiary_id: string | null;
}

interface Props {
  vehicles: RepairVehicle[];
  subsidiaries: { id: string; name: string }[];
}

function extractAmount(text: string): number | null {
  const matches = text.match(/\d[\d,]*\.\d{2}/g);
  if (!matches) return null;
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) : null;
}

export function RepairClaimForm({ vehicles, subsidiaries }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState<string>(vehicles[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicleId);
    if (receipt) fd.set("receipt", receipt);
    startTransition(async () => {
      try {
        const result = await submitRepairClaim(fd);
        if (result && "error" in result) toast.error(result.error);
        else {
          sessionStorage.removeItem("repair-receipt");
          toast.success("Repair claim submitted for review");
          if (result && "redirectTo" in result) router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1 · Vehicle */}
      <FormSection step={1} title="Vehicle">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={selectClass} required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.plate_number} · {v.make} {v.model}</option>
          ))}
        </select>
        {selectedVehicle && (
          <PlateBadge plate={selectedVehicle.plate_number} country={selectedVehicle.plate_country} size="sm" />
        )}
      </FormSection>

      {/* 2 · Bill to */}
      <FormSection step={2} title="Bill to subsidiary" hint="Who should this repair be charged to?">
        <select name="subsidiary_id" defaultValue={selectedVehicle?.default_subsidiary_id ?? ""} className={selectClass}>
          <option value="">— not sure / leave to accountant —</option>
          {subsidiaries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </FormSection>

      {/* 3 · Repair description */}
      <FormSection step={3} title="What was repaired?">
        <textarea
          name="description"
          rows={3}
          required
          placeholder="e.g. Replaced front brake pads and bled brakes"
          className={textareaClass}
        />
      </FormSection>

      {/* 4 · Amount & currency */}
      <FormSection step={4} title="Amount spent">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <FieldLabel required>Amount</FieldLabel>
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className={`${fieldClass} font-plate font-bold`}
            />
          </div>
          <div>
            <FieldLabel>Currency</FieldLabel>
            <select name="currency" defaultValue="USD" className={selectClass}>
              <option value="USD">USD</option>
              <option value="ZWL">ZWL</option>
              <option value="ZAR">ZAR</option>
            </select>
          </div>
        </div>
      </FormSection>

      {/* 5 · Odometer */}
      <FormSection step={5} title="Odometer at repair" hint="Optional">
        <input
          name="odometer_km"
          type="number"
          inputMode="numeric"
          min="0"
          defaultValue={selectedVehicle?.current_odometer_km ?? ""}
          className={`${fieldClass} font-plate`}
        />
      </FormSection>

      {/* 6 · Receipt photo */}
      <FormSection step={6} title="Receipt photo" hint="Photograph the receipt — scan to auto-fill the amount.">
        <div className="flex justify-end">
          <OcrButton
            label="Scan amount"
            onText={(text) => {
              const found = extractAmount(text);
              if (found) { setAmount(String(found)); toast.success(`Amount detected: ${found.toFixed(2)}`); }
              else toast.message("No amount found — enter it manually.");
            }}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-ink-200 bg-white text-ink-600 text-xs font-semibold"
          />
        </div>
        <SinglePhotoInput onFileChange={setReceipt} label="receipt" persistKey="repair-receipt" />
      </FormSection>

      {/* 7 · Submit */}
      <SubmitButton disabled={isPending} icon={<Wrench className="h-5 w-5" />}>
        {isPending ? "Submitting…" : "Submit repair claim"}
      </SubmitButton>
    </form>
  );
}
