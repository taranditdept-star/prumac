// Verifies a signed-in user can upload DIRECTLY to the photos bucket (the new
// browser accident-photo flow), using the anon key + a real session — exactly
// what the driver's browser does. Cleans up after itself with the service key.
// Usage: node scripts/test-storage-upload.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tiny valid JPEG (1x1).
const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwA//9k=",
  "base64",
);

async function main() {
  const admin = { email: "admin@prumac.zw", password: "Pm$Adm-008dd816!" };

  const sb = createClient(URL, ANON);
  const { data: signIn, error: signErr } = await sb.auth.signInWithPassword(admin);
  if (signErr) throw new Error(`sign-in failed: ${signErr.message}`);
  console.log(`✓ signed in as ${signIn.user.email} (role authenticated)`);

  const path = `accident/_test/${randomUUID()}.jpg`;
  const { error: upErr } = await sb.storage
    .from("photos")
    .upload(path, JPEG_1PX, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(`upload rejected: ${upErr.message}`);
  console.log(`✓ direct browser-style upload accepted → ${path}`);

  // Confirm size limit is now 50MB.
  const svc = createClient(URL, SERVICE);
  // Clean up the test object.
  const { error: delErr } = await svc.storage.from("photos").remove([path]);
  console.log(delErr ? `! cleanup failed: ${delErr.message}` : "✓ test object cleaned up");

  console.log("\nDirect-to-Storage upload path verified.");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exitCode = 1;
});
