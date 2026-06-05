import { Truck } from "lucide-react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ink-50 via-white to-orange-50/40 px-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-orange-200/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-sky-200/30 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-xl shadow-orange-500/30">
              <Truck className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-base font-bold text-ink-900 leading-none">PRUMAC</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400 mt-1.5 font-bold">
                Fleet Platform
              </p>
            </div>
          </div>
        </div>
        {children}
        <p className="text-center text-xs text-ink-400 mt-6">
          © 2026 Ensign Holdings · PRUMAC Fleet
        </p>
      </div>
    </div>
  );
}
