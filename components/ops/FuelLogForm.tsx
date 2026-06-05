"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OcrButton } from "@/components/ocr/OcrButton";
import { parseFuelReceipt } from "@/lib/ocr/parse";
import { createFuelLog } from "@/actions/fuel";
import type { CountryCode } from "@/types/domain";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

interface VehicleOption {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
}

interface CardOption {
  id: string;
  card_number: string;
  provider: string | null;
}

export function FuelLogForm({
  vehicles,
  cards,
}: {
  vehicles: VehicleOption[];
  cards: CardOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [litres, setLitres] = useState("");
  const [price, setPrice] = useState("");
  const [total, setTotal] = useState("");
  const [station, setStation] = useState("");
  const [filledAt, setFilledAt] = useState(localNow);

  // Auto-fill total when litres × price is known and total is still blank.
  function recompute(nextLitres: string, nextPrice: string) {
    const l = parseFloat(nextLitres);
    const p = parseFloat(nextPrice);
    if (!Number.isNaN(l) && !Number.isNaN(p)) setTotal((l * p).toFixed(2));
  }

  // Receipt OCR → prefill the obvious fields, then let the user review.
  function handleReceiptScan(text: string) {
    const f = parseFuelReceipt(text);
    if (f.litres) setLitres(f.litres);
    if (f.pricePerLitre) setPrice(f.pricePerLitre);
    if (f.total) setTotal(f.total);
    else if (f.litres && f.pricePerLitre) recompute(f.litres, f.pricePerLitre);
    if (f.station) setStation(f.station);
    if (f.date) setFilledAt(`${f.date}T12:00`);

    const got = [
      f.litres && "litres",
      f.total && "total",
      f.pricePerLitre && "price",
      f.date && "date",
    ].filter(Boolean);
    toast.success(got.length ? `Scanned ${got.join(", ")} — please review` : "Scan complete — review the fields");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createFuelLog(fd);
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Receipt OCR */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50/60 border border-orange-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-800">Scan a fuel receipt</p>
          <p className="text-xs text-ink-500">Reads litres, price, total and date right on your device</p>
        </div>
        <OcrButton label="Scan receipt" onText={handleReceiptScan} />
      </div>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Vehicle &amp; fill
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="vehicle_id">Vehicle *</Label>
            <select id="vehicle_id" name="vehicle_id" className={SELECT} required defaultValue="">
              <option value="" disabled>
                Select vehicle…
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.plate_country}) — {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filled_at">Filled at *</Label>
            <Input
              id="filled_at"
              name="filled_at"
              type="datetime-local"
              value={filledAt}
              onChange={(e) => setFilledAt(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="odometer_km">Odometer (km)</Label>
            <Input id="odometer_km" name="odometer_km" type="number" min={0} className="font-plate" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="litres">Litres *</Label>
            <Input
              id="litres"
              name="litres"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={litres}
              onChange={(e) => {
                setLitres(e.target.value);
                recompute(e.target.value, price);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="price_per_litre">Price / litre</Label>
            <Input
              id="price_per_litre"
              name="price_per_litre"
              type="number"
              step="0.0001"
              min="0"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                recompute(litres, e.target.value);
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="total_cost">Total cost *</Label>
            <Input
              id="total_cost"
              name="total_cost"
              type="number"
              step="0.01"
              min="0"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select id="currency" name="currency" className={SELECT} defaultValue="USD">
              <option value="USD">USD</option>
              <option value="ZAR">ZAR</option>
              <option value="ZWG">ZWG</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment_method">Payment</Label>
            <select id="payment_method" name="payment_method" className={SELECT} defaultValue="fuel_card">
              <option value="fuel_card">Fuel card</option>
              <option value="cash">Cash</option>
              <option value="coupon">Coupon</option>
              <option value="company_pump">Company pump</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Details
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="station">Station</Label>
            <Input
              id="station"
              name="station"
              placeholder="Puma Borrowdale"
              value={station}
              onChange={(e) => setStation(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fuel_card_id">Fuel card</Label>
            <select id="fuel_card_id" name="fuel_card_id" className={SELECT} defaultValue="">
              <option value="">— none —</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.card_number}
                  {c.provider ? ` · ${c.provider}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="is_full_tank" defaultChecked className="h-4 w-4 rounded border-input" />
          Tank filled to full
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </fieldset>

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isPending}>
          {isPending ? "Saving…" : "Log fuel"}
        </Button>
        <a href="/fuel" className="flex items-center text-sm text-muted-foreground hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}
