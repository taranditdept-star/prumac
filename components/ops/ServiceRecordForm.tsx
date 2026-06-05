"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wrench, Building2, Calendar, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createServiceRecord } from "@/actions/maintenance";
import type { CountryCode } from "@/types/domain";

interface VehicleOpt {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
  default_subsidiary_id: string | null;
}

interface SubOpt {
  id: string;
  name: string;
}

interface ServiceRecordFormProps {
  vehicles: VehicleOpt[];
  subsidiaries: SubOpt[];
}

export function ServiceRecordForm({ vehicles, subsidiaries }: ServiceRecordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState("");
  const [isRoutine, setIsRoutine] = useState(true);
  const [odometer, setOdometer] = useState("");
  const [subsidiaryId, setSubsidiaryId] = useState("");

  function onPickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setOdometer(String(v.current_odometer_km));
      if (v.default_subsidiary_id) setSubsidiaryId(v.default_subsidiary_id);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("is_routine_service", isRoutine ? "true" : "false");
    startTransition(async () => {
      try {
        const r = await createServiceRecord(fd);
        if (r && "error" in r) toast.error(r.error);
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Vehicle */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-orange-600" />
          <h2 className="text-base font-bold text-ink-900">Vehicle</h2>
        </div>
        <select
          name="vehicle_id"
          value={vehicleId}
          onChange={(e) => onPickVehicle(e.target.value)}
          className={selectCls}
          required
        >
          <option value="">— select a vehicle —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate_number} · {v.make} {v.model}
            </option>
          ))}
        </select>
      </div>

      {/* Service type + dates */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-sky-600" />
          <h2 className="text-base font-bold text-ink-900">Details</h2>
        </div>

        {/* Service vs Repair toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsRoutine(true)}
            className={`h-12 rounded-xl border-2 text-sm font-bold transition-all ${
              isRoutine
                ? "bg-emerald-500 border-emerald-500 text-white"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Routine service
          </button>
          <button
            type="button"
            onClick={() => setIsRoutine(false)}
            className={`h-12 rounded-xl border-2 text-sm font-bold transition-all ${
              !isRoutine
                ? "bg-amber-500 border-amber-500 text-white"
                : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            }`}
          >
            Repair / breakdown
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Performed on *
            </Label>
            <Input
              type="date"
              name="performed_at"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={inputCls + " font-plate"}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Odometer (km)
            </Label>
            <Input
              type="number"
              name="odometer_km"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className={inputCls + " font-plate"}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Workshop
            </Label>
            <Input name="workshop" placeholder="e.g. CMC Bulawayo" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Workshop invoice ref
            </Label>
            <Input name="invoice_reference" placeholder="INV-2026-0042" className={inputCls + " font-plate"} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Summary
          </Label>
          <textarea
            name="summary"
            rows={3}
            placeholder="What was done? Parts replaced, services performed"
            className={inputCls + " py-2.5 resize-none h-auto min-h-[88px]"}
          />
        </div>
      </div>

      {/* Cost + reimbursement */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-bold text-ink-900">Cost & reimbursement</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Total amount (USD) *
            </Label>
            <Input
              name="total_amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className={inputCls + " font-plate"}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Reimburse from subsidiary
            </Label>
            <select
              name="reimburse_from_subsidiary_id"
              value={subsidiaryId}
              onChange={(e) => setSubsidiaryId(e.target.value)}
              className={selectCls}
            >
              <option value="">— none / PRUMAC bears cost —</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-ink-500 inline-flex items-start gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
          When a subsidiary is set, this cost will appear as a credit on their next invoice.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 px-4 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          Cancel
        </button>
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 px-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-lg shadow-orange-500/30"
        >
          {isPending ? "Saving…" : "Save service record"}
        </Button>
      </div>
    </form>
  );
}
