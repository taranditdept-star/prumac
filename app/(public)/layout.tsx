import { MapPin, ShieldCheck, ReceiptText } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-14 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-orange-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-[28rem] w-[28rem] rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-20" />

        <div className="relative">
          {/* Large brand logo */}
          <div className="inline-flex rounded-[2rem] bg-white px-12 py-9 shadow-2xl shadow-black/30">
            <Logo height={120} />
          </div>

          <h1 className="mt-12 text-5xl font-extrabold leading-[1.05] tracking-tight">
            Move your fleet with confidence.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-300">
            Live tracking, trip logging, maintenance, billing and safety — one platform for the
            entire Ensign fleet.
          </p>

          <ul className="mt-10 space-y-4">
            <Feature icon={MapPin} text="Real-time vehicle tracking & trip history" />
            <Feature icon={ShieldCheck} text="Inspections, incidents & instant safety alerts" />
            <Feature icon={ReceiptText} text="Automated maintenance & subsidiary billing" />
          </ul>
        </div>

        <p className="absolute bottom-10 left-14 text-xs text-slate-400">
          © 2026 Ensign Holdings · PRUMAC Fleet
        </p>
      </aside>

      {/* Form area */}
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-ink-50 via-white to-orange-50/40 px-5 py-10">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-orange-200/30 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 lg:hidden" />

        {/* Mobile brand header (single logo — no duplication) */}
        <div className="relative mb-8 flex flex-col items-center text-center lg:hidden">
          <Logo height={64} />
          <p className="mt-3 text-sm text-ink-500">Fleet management platform</p>
        </div>

        <div className="relative w-full max-w-xl">{children}</div>

        <p className="relative mt-8 text-center text-xs text-ink-400 lg:hidden">
          © 2026 Ensign Holdings · PRUMAC Fleet
        </p>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <Icon className="h-5 w-5 text-orange-400" />
      </span>
      <span className="text-[15px] text-slate-200">{text}</span>
    </li>
  );
}
