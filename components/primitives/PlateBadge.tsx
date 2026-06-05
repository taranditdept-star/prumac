import type { CountryCode } from "@/types/domain";

interface PlateBadgeProps {
  plate: string;
  country: CountryCode;
  className?: string;
  size?: "sm" | "md";
}

export function PlateBadge({ plate, country, className = "", size = "md" }: PlateBadgeProps) {
  const isSmall = size === "sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white shadow-sm font-plate font-semibold text-ink-900 ${
        isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      } ${className}`}
    >
      <span className="text-[9px] font-sans font-bold text-slate-400 tracking-wider">
        {country}
      </span>
      <span className="h-3 w-px bg-slate-200" />
      {plate}
    </span>
  );
}
