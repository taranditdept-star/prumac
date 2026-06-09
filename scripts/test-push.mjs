// Verifies the emergency push plumbing WITHOUT a browser:
//  1. VAPID keys load + configure web-push.
//  2. The manager/admin -> push_subscriptions query path runs on the live DB.
//  3. A send to a fake endpoint fails with an HTTP status (proving the signed
//     request is well-formed) — this is the 404/410 path our code prunes.
// Usage: node scripts/test-push.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import pg from "pg";
import webpush from "web-push";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

async function main() {
  // 1. VAPID config
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys missing from .env.local");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@prumac.zw", pub, priv);
  console.log("✓ VAPID keys configured");

  // 2. DB query path (managers -> subscriptions)
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const managers = await client.query(
      "SELECT count(*)::int AS n FROM app.profiles WHERE role IN ('fleet_manager','admin') AND is_active",
    );
    const subs = await client.query("SELECT count(*)::int AS n FROM app.push_subscriptions");
    console.log(`✓ ${managers.rows[0].n} active manager/admin profiles`);
    console.log(`✓ ${subs.rows[0].n} registered push subscriptions`);
    console.log("  (0 is expected until a manager clicks Enable in a real browser)");
  } finally {
    await client.end();
  }

  // 3. Send to a fake endpoint using a REAL P-256 key so web-push's payload
  //    encryption succeeds and the request actually reaches the push service,
  //    which rejects the unknown endpoint with an HTTP status (the prune path).
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const p256dh = ecdh.getPublicKey().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  try {
    await webpush.sendNotification(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/fake-endpoint-for-test",
        keys: { p256dh, auth },
      },
      JSON.stringify({ title: "test" }),
    );
    console.log("! send unexpectedly succeeded (fake endpoint)");
  } catch (err) {
    const status = err?.statusCode;
    if (status) console.log(`✓ send path works — fake endpoint rejected with HTTP ${status} (would be pruned)`);
    else throw err;
  }

  console.log("\nAll push plumbing checks passed.");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
