// Generate PWA / home-screen icons.
// Source priority: public/logo.png (your official artwork) → else the
// placeholder mark public/brand/prumac-mark.svg.
// Run after saving your logo:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

// Prefer the official logo; fall back to the placeholder vector mark.
const candidates = [
  resolve(root, "public/logo.png"),
  resolve(root, "public/brand/logo-prumac.png"),
  resolve(root, "public/brand/prumac-mark.svg"),
];
const source = candidates.find((p) => existsSync(p)) ?? candidates[candidates.length - 1];
console.log(`Icon source: ${source.replace(root + "\\", "").replace(root + "/", "")}`);

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }; // logo is dark-on-transparent → reads on white
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function compose(size, markRatio, bg) {
  const markSize = Math.round(size * markRatio);
  const mark = await sharp(source)
    .resize(markSize, markSize, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
  const pad = Math.round((size - markSize) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer();
}

const targets = [
  { file: "icon-192.png", size: 192, ratio: 0.8, bg: WHITE },
  { file: "icon-512.png", size: 512, ratio: 0.8, bg: WHITE },
  { file: "maskable-512.png", size: 512, ratio: 0.6, bg: WHITE }, // safe zone for adaptive icons
  { file: "apple-touch-icon.png", size: 180, ratio: 0.8, bg: WHITE },
  { file: "favicon-32.png", size: 32, ratio: 0.86, bg: WHITE },
];

for (const t of targets) {
  const buf = await compose(t.size, t.ratio, t.bg);
  writeFileSync(resolve(outDir, t.file), buf);
  console.log(`  ✓ ${t.file}`);
}
console.log("Done. Icons in public/icons/");
