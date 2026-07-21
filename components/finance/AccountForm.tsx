"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, Save } from "lucide-react";
import { upsertAccount } from "@/actions/finance";
import type { AccountType } from "@/lib/finance/accounts";

const TYPES: { value: AccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

/** The conventional normal balance for a given account type. */
function normalFor(type: AccountType): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

const field =
  "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-ink-500";

export function AccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("asset");
  const [normalBalance, setNormalBalance] = useState<"debit" | "credit">("debit");
  const [subtype, setSubtype] = useState("");

  function reset() {
    setCode("");
    setName("");
    setType("asset");
    setNormalBalance("debit");
    setSubtype("");
  }

  function onType(next: AccountType) {
    setType(next);
    setNormalBalance(normalFor(next)); // sensible default; still editable
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required.");
      return;
    }
    const fd = new FormData();
    fd.set("code", code.trim());
    fd.set("name", name.trim());
    fd.set("type", type);
    fd.set("normal_balance", normalBalance);
    fd.set("subtype", subtype.trim());

    startTransition(async () => {
      const r = await upsertAccount(fd);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Account ${code.trim()} — ${name.trim()} saved.`);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-orange-600 text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" />
        Add account
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white border border-ink-200/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">New account</p>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={label}>Code *</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 5800" required className={`${field} font-plate`} />
        </div>
        <div className="lg:col-span-2">
          <label className={label}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing & Advertising" required className={field} />
        </div>
        <div>
          <label className={label}>Type</label>
          <select value={type} onChange={(e) => onType(e.target.value as AccountType)} className={`${field} cursor-pointer`}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Normal balance</label>
          <select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value as "debit" | "credit")} className={`${field} cursor-pointer`}>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
        </div>
        <div>
          <label className={label}>Subtype (optional)</label>
          <input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. Current asset" className={field} />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving…" : "Save account"}
        </button>
      </div>
    </form>
  );
}
