import Image from "next/image";
import type { CSSProperties } from "react";

const LOGO_SRC = "/brand/logo-prumac.png";
const LOGO_RATIO = 140 / 50; // intrinsic aspect of the official logo

/**
 * Official PRUMAC Connect logo (horizontal). Renders on light surfaces.
 * To change the artwork, replace public/brand/logo-prumac.png (and run
 * `node scripts/gen-icons.mjs` to refresh the app icons).
 */
export function Logo({ height = 28, className }: { height?: number; className?: string }) {
  return (
    <Image
      src={LOGO_SRC}
      alt="PRUMAC Connect"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      priority
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

/**
 * Emblem-only vector mark, used where a compact square logo is needed
 * (e.g. the install banner chip). Brand colours: red #E5231B / navy #1C2B6B.
 */
export function BrandMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={style} fill="none" aria-hidden>
      <g transform="translate(32 32) rotate(12)">
        <rect x="-23" y="-8" width="21" height="16" rx="8" fill="#E5231B" />
        <rect x="-8" y="-23" width="16" height="21" rx="8" fill="#E5231B" />
        <rect x="2" y="-8" width="21" height="16" rx="8" fill="#1C2B6B" />
        <rect x="-8" y="2" width="16" height="21" rx="8" fill="#1C2B6B" />
      </g>
    </svg>
  );
}
