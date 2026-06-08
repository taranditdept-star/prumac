// Lightweight, render-instantly skeletons used by route-group loading.tsx files
// so navigation shows feedback the moment a link is clicked.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-200/70 ${className}`} />;
}

/** Ops/billing pages: header + stat tiles + a table. */
export function OpsPageSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="space-y-2">
        <Bar className="h-8 w-56" />
        <Bar className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
            <Bar className="h-4 w-24" />
            <Bar className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Bar className="h-10 w-full max-w-md rounded-xl" />
      <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-ink-100 last:border-0">
            <Bar className="h-6 w-20" />
            <Bar className="h-6 w-28" />
            <Bar className="h-6 w-40 hidden md:block" />
            <Bar className="h-6 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Driver mobile pages: hero + cards. */
export function DriverPageSkeleton() {
  return (
    <div className="px-4 py-5 space-y-5">
      <Bar className="h-40 w-full rounded-[28px]" />
      <div className="grid grid-cols-2 gap-3">
        <Bar className="h-24 rounded-3xl" />
        <Bar className="h-24 rounded-3xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bar key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
