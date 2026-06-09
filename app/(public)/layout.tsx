export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-orange-50/50 px-4 py-8">
      {/* Soft ambient decorations behind the card */}
      <div className="pointer-events-none absolute -left-28 -top-28 h-[34rem] w-[34rem] rounded-full bg-violet-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-28 h-[34rem] w-[34rem] rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-200/20 blur-3xl" />

      <div className="relative flex w-full items-center justify-center">{children}</div>
    </div>
  );
}
