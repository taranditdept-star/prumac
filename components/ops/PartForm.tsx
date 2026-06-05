"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createPart } from "@/actions/parts";
import { PART_CATEGORIES } from "@/lib/validation/part";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

export function PartForm() {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createPart(fd);
      if (r && "error" in r) toast.error(r.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Part
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" placeholder="Oil filter — Hino 300" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU / part no.</Label>
            <Input id="sku" name="sku" className="font-plate" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" className={SELECT} defaultValue="other">
              {PART_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unit</Label>
            <select id="unit" name="unit" className={SELECT} defaultValue="each">
              <option value="each">each</option>
              <option value="litre">litre</option>
              <option value="set">set</option>
              <option value="metre">metre</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Supplier</Label>
            <Input id="supplier" name="supplier" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Stock &amp; cost
        </legend>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="opening_stock">Opening stock</Label>
            <Input id="opening_stock" name="opening_stock" type="number" step="0.01" min="0" defaultValue={0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reorder_level">Reorder level</Label>
            <Input id="reorder_level" name="reorder_level" type="number" step="0.01" min="0" defaultValue={0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit_cost">Unit cost</Label>
            <Input id="unit_cost" name="unit_cost" type="number" step="0.01" min="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select id="currency" name="currency" className={SELECT} defaultValue="USD">
              <option value="USD">USD</option>
              <option value="ZAR">ZAR</option>
              <option value="ZWG">ZWG</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="location">Store location</Label>
            <Input id="location" name="location" placeholder="Harare main store" />
          </div>
        </div>
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
          {isPending ? "Saving…" : "Add part"}
        </Button>
        <a href="/parts" className="flex items-center text-sm text-muted-foreground hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}
