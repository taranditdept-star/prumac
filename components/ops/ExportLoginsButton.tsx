"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, KeyRound, TriangleAlert } from "lucide-react";

export function ExportLoginsButton() {
  const [busy, setBusy] = useState<null | "new" | "all">(null);
  const [confirmAll, setConfirmAll] = useState(false);

  async function run(mode: "new" | "all") {
    setBusy(mode);
    try {
      const res = await fetch(`/admin/logins/export?mode=${mode}`, { method: "POST" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prumac-driver-logins-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(mode === "all" ? "All passwords reset — they're in the file" : "Driver logins exported");
    } catch {
      toast.error("Export failed — please try again.");
    } finally {
      setBusy(null);
      setConfirmAll(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-ink-200/70 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">Driver logins (Excel)</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Name, Driver ID (username), phone and password. Existing passwords can&rsquo;t be shown — they&rsquo;re stored
            encrypted — so a password only appears where a new one is set.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("new")}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white transition-all hover:bg-ink-800 disabled:opacity-50"
            >
              {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export logins
            </button>
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              Reset all &amp; show passwords
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">
            <span className="font-semibold">Export logins</span> sets fresh passwords for drivers who&rsquo;ve never signed
            in (active drivers untouched). <span className="font-semibold">Reset all</span> gives every driver a new
            password so you can see them all.
          </p>

          {confirmAll && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="flex items-start gap-2 text-xs text-rose-700">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                This replaces the password of <b>every driver</b>, including those already signed in — they&rsquo;ll each
                need the new password from this file. Continue?
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => run("all")}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Reset all &amp; download
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAll(false)}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-semibold text-ink-600 hover:bg-ink-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
