// Sends a REAL push to every stored subscription using the VAPID keys in
// .env.local — the exact pipeline reportAccident uses. Prints the push
// service's HTTP status per device so we can tell whether the send works
// (201 = accepted; 403 = VAPID key mismatch; 404/410 = subscription gone).
// Usage: node scripts/send-test-push.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import webpush from "web-push";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@prumac.zw",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select id, endpoint, p256dh, auth from app.push_subscriptions");
await c.end();

console.log(`Sending test push to ${rows.length} subscription(s)…\n`);
for (const s of rows) {
  try {
    const res = await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({
        title: "🚨 PRUMAC test alert",
        body: "If you can see this, push notifications are working.",
        url: "/live",
        tag: "prumac-test",
      }),
    );
    console.log(`✓ ${s.endpoint.slice(0, 50)}… → HTTP ${res.statusCode} (accepted)`);
  } catch (err) {
    console.log(`✗ ${s.endpoint.slice(0, 50)}… → HTTP ${err?.statusCode ?? "?"}  ${err?.body || err?.message || ""}`);
  }
}
