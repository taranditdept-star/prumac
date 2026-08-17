// Guard: a "use server" module may ONLY export async functions. Exporting a
// const/class from one breaks the entire module AT RUNTIME (the build passes),
// which took the accident page down. Run this before shipping.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["actions", "app", "lib"];
const offenders = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) check(p);
  }
}

function check(file) {
  const src = readFileSync(file, "utf8");
  if (!/^\s*["']use server["']/m.test(src.split("\n").slice(0, 5).join("\n"))) return;
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // `export type` / `export interface` are erased at compile time — fine.
    if (/^export\s+(const|let|var|class|enum)\s/.test(line)) {
      offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 70)}`);
    }
  });
}

for (const r of roots) { try { walk(r); } catch {} }

if (offenders.length) {
  console.error("✗ Non-async exports found in \"use server\" files:\n");
  for (const o of offenders) console.error("  " + o);
  console.error("\nMove these into a plain module (e.g. lib/) and import them.");
  process.exit(1);
}
console.log("✓ every \"use server\" module exports only async functions");
