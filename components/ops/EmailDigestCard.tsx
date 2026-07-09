"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { sendTestDigest } from "@/actions/notifications";

export function EmailDigestCard() {
  const [sending, setSending] = useState(false);

  function test() {
    setSending(true);
    sendTestDigest()
      .then((r) => {
        if (!r.configured) toast.error("Email isn't configured — set the SMTP_* variables in Vercel and redeploy.");
        else if (r.skipped === "no-alerts") toast.success("Email works — no open alerts to send right now.");
        else if (r.skipped === "no-recipients") toast.error("No manager/admin has an email address on file.");
        else if (r.sent > 0) toast.success(`Digest sent to ${r.sent} manager${r.sent > 1 ? "s" : ""}.`);
        else toast.error(`Email send failed for all ${r.recipients} recipient(s) — check SMTP credentials.`);
      })
      .catch(() => toast.error("Test failed."))
      .finally(() => setSending(false));
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-emerald-100">
          <Mail className="h-4 w-4 text-emerald-600" />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">Email alert digest</h2>
          <p className="text-xs text-ink-500">Managers get a daily email summary of open alerts (expiries, service due, incidents).</p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-500">
        Runs automatically with the daily job. To enable, set{" "}
        <code className="font-mono">SMTP_HOST</code>, <code className="font-mono">SMTP_PORT</code>,{" "}
        <code className="font-mono">SMTP_USER</code>, <code className="font-mono">SMTP_PASS</code> (e.g. a Gmail
        address + app password) in Vercel, then redeploy.
      </p>

      <button
        type="button"
        onClick={test}
        disabled={sending}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send test digest now"}
      </button>
    </section>
  );
}
