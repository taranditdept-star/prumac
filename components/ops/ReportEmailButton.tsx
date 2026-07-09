"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { sendTestMonthlyReport } from "@/actions/notifications";

export function ReportEmailButton() {
  const [sending, setSending] = useState(false);
  function send() {
    setSending(true);
    sendTestMonthlyReport()
      .then((r) => {
        if (!r.configured) toast.error("Email isn't configured — set the SMTP_* variables in Vercel and redeploy.");
        else if (r.skipped === "no-recipients") toast.error("No manager/admin has a real email address on file.");
        else if (r.sent > 0) toast.success(`Monthly report (${r.period}) sent to ${r.sent} manager${r.sent > 1 ? "s" : ""}.`);
        else toast.error("Report email failed — check SMTP credentials.");
      })
      .catch(() => toast.error("Failed to send report."))
      .finally(() => setSending(false));
  }
  return (
    <button
      type="button"
      onClick={send}
      disabled={sending}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-50"
    >
      <Mail className="h-4 w-4" /> {sending ? "Sending…" : "Email report"}
    </button>
  );
}
