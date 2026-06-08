"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench, Camera, X, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OcrButton } from "@/components/ocr/OcrButton";
import { submitRepairClaim } from "@/actions/repairs";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { compressImage } from "@/lib/image/compress";
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

// Pull the largest decimal currency amount out of OCR text (usually the total).
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) { setPhotoUrl(null); setPhotoFile(null); return; }
    const file = await compressImage(raw);
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicleId);
    if (photoFile) fd.set("receipt", photoFile); // send the compressed receipt
    startTransition(async () => {
      try {
        const result = await submitRepairClaim(fd);
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          toast.success("Repair claim submitted for review");
          router.push(result.redirectTo);
          router.refresh();
        } else {
          toast.success("Repair claim submitted for review");
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  const inputCls =
    "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Vehicle */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Vehicle *</Label>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className={selectCls}
          required
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate_number} · {v.make} {v.model}
            </option>
          ))}
        </select>
        {selectedVehicle && (
          <div className="pt-1">
            <PlateBadge
              plate={selectedVehicle.plate_number}
              country={selectedVehicle.plate_country}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Bill to */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Bill to subsidiary
        </Label>
        <select
          name="subsidiary_id"
          defaultValue={selectedVehicle?.default_subsidiary_id ?? ""}
          className={selectCls}
        >
          <option value="">— not sure / leave to accountant —</option>
          {subsidiaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          What was repaired? *
        </Label>
        <textarea
          name="description"
          rows={3}
          required
          placeholder="e.g. Replaced front brake pads and bled brakes"
          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
      </div>

      {/* Amount + currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Amount spent *
          </Label>
          <Input
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="h-12 text-lg font-plate font-bold tabular"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Currency</Label>
          <select name="currency" defaultValue="USD" className={selectCls}>
            <option value="USD">USD</option>
            <option value="ZWL">ZWL</option>
            <option value="ZAR">ZAR</option>
          </select>
        </div>
      </div>

      {/* Odometer (optional) */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Odometer at repair (optional)
        </Label>
        <Input
          name="odometer_km"
          type="number"
          inputMode="numeric"
          min="0"
          defaultValue={selectedVehicle?.current_odometer_km ?? ""}
          className="h-12 font-plate tabular"
        />
      </div>

      {/* Receipt photo + OCR */}
      <div className="rounded-2xl bg-white border border-ink-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-ink-500" />
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-600">
              Receipt
            </Label>
          </div>
          <OcrButton
            label="Scan amount"
            onText={(text) => {
              const found = extractAmount(text);
              if (found) {
                setAmount(String(found));
                toast.success(`Amount detected: ${found.toFixed(2)}`);
              } else {
                toast.message("No amount found — enter it manually.");
              }
            }}
          />
        </div>
        {photoUrl ? (
          <div className="relative rounded-xl overflow-hidden ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Receipt" className="w-full max-h-56 object-cover" />
            <label className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-ink-950/70 backdrop-blur text-white flex items-center justify-center cursor-pointer">
              <X className="h-4 w-4" />
              <input
                type="file"
                name="receipt"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="sr-only"
              />
            </label>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 hover:border-orange-300 hover:bg-orange-50/40 py-8 cursor-pointer transition-all">
            <Camera className="h-6 w-6 text-ink-400" />
            <span className="text-xs uppercase tracking-wider text-ink-400 font-bold">
              Tap to photograph receipt
            </span>
            <input
              type="file"
              name="receipt"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="sr-only"
            />
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        <Wrench className="h-5 w-5" />
        {isPending ? "Submitting…" : "Submit repair claim"}
      </button>
    </form>
  );
}
