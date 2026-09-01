/**
 * Does the driver app actually work with no signal?
 *
 *   node scripts/test-offline.mjs [driver-email]
 *
 * Offline has broken four separate times — a cached redirect, a page cache
 * wiped by every deploy, a saved page whose scripts were missing, and an
 * installed icon pointing at a URL that can never be cached. Each one looked
 * fine until a real phone was out of signal, so this drives the real journey:
 * open it in the yard, cut the network, then launch from the icon and tap
 * around.
 *
 * The network is cut at a proxy, NOT with Playwright's setOffline. setOffline
 * does not reach the service worker's target, so the worker keeps its network
 * and every one of those four faults reads as a pass. Blocking only new tunnels
 * is not enough either: HTTP/2 multiplexes over one already-open socket, so the
 * live ones have to be torn down.
 */
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createChunks } from "@supabase/ssr/dist/main/utils/chunker.js";
import { stringToBase64URL } from "@supabase/ssr/dist/main/utils/base64url.js";

const HOST = process.env.PRUMAC_HOST ?? "prumac.vercel.app";
const EMAIL = process.argv[2] ?? "pmd035@drivers.prumac.local";
const PORT = 8907;

function env() {
  return Object.fromEntries(
    fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function startProxy(port) {
  const live = new Set();
  const state = {
    online: true, allowed: 0, blocked: 0,
    cut() { this.online = false; for (const s of live) s.destroy(); live.clear(); },
  };
  const server = http.createServer((_req, res) => { res.writeHead(502); res.end(); });
  server.on("connect", (req, socket, head) => {
    if (!state.online) { state.blocked++; socket.destroy(); return; }
    state.allowed++;
    const [host, p] = req.url.split(":");
    const up = net.connect(Number(p) || 443, host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      up.write(head); up.pipe(socket); socket.pipe(up);
    });
    live.add(socket); live.add(up);
    const bye = () => { live.delete(socket); live.delete(up); };
    up.on("error", () => { socket.destroy(); bye(); });
    socket.on("error", () => { up.destroy(); bye(); });
    up.on("close", bye); socket.on("close", bye);
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r({ state, server })));
}

/** A signed-in cookie jar without typing anyone's password. */
async function cookieJar(email) {
  const e = env();
  const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lerr) throw lerr;
  const anon = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: verr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
  if (verr) throw verr;
  const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value = "base64-" + stringToBase64URL(JSON.stringify(s.session));
  const chunks = createChunks(name, value);
  return (chunks.length ? chunks : [{ name, value }]).map((c) => ({
    name: c.name, value: c.value, domain: HOST, path: "/", httpOnly: false, secure: true, sameSite: "Lax",
  }));
}

const proxy = await startProxy(PORT);
const browser = await chromium.launch({ headless: true, proxy: { server: `http://127.0.0.1:${PORT}` } });
let failures = 0;

// ── A phone that has never saved anything, launched with no signal ───────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const pg = await ctx.newPage();
  await pg.goto(`https://${HOST}/login`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await pg.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).catch(() => {});
  await pg.waitForTimeout(6000);
  proxy.state.cut();
  await pg.goto(`https://${HOST}/`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  const says = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim()).catch(() => "");
  const ok = /hasn.{0,3}t saved your screens/i.test(says);
  if (!ok) failures++;
  console.log(`A. nothing saved, launched from the icon: ${ok ? "✓ explains how to fix it" : "❌ " + (says.slice(0, 90) || "blank")}`);
  await ctx.close();
}
proxy.state.online = true;

// ── A driver who opened it in the yard, then drove out of signal ─────────────
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
await ctx.addCookies(await cookieJar(EMAIL));
let pg = await ctx.newPage();
await pg.goto(`https://${HOST}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 })
  .catch(() => { failures++; console.log("❌ the worker never took control"); });
await pg.waitForTimeout(22000); // warming

const saved = await pg.evaluate(async () => ({
  pages: (await (await caches.open("prumac-pages")).keys()).length,
  assets: (await (await caches.open("prumac-assets")).keys()).length,
}));
console.log(`\nB. in the yard: saved ${saved.pages} screens and ${saved.assets} script/style files`);
if (saved.pages < 8 || saved.assets < 10) { failures++; console.log("   ❌ too little was saved"); }

// A page whose scripts are missing renders the crash screen, so the freshness
// control below also proves the saved copy is being used at all.
const stamp = async (path) => {
  const res = await pg.goto(`https://${HOST}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  return res ? ((await res.headerValue("x-vercel-id")) ?? (await res.headerValue("date")) ?? "?") : "(none)";
};
const fresh = [await stamp("/home"), await stamp("/home"), await stamp("/home")];
const allFresh = new Set(fresh).size === fresh.length;
if (!allFresh) failures++;
console.log(`   with signal, three loads of /home: ${allFresh ? "✓ every one from the server" : "❌ one was served from the cache"}`);

console.log("\nC. → NETWORK CUT");
proxy.state.cut();

async function look(label) {
  await pg.waitForTimeout(8000); // a failed prefetch falls back to a full load
  const body = await pg.content();
  const txt = await pg.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim()).catch(() => "");
  const tabs = await pg.locator("nav a").count().catch(() => 0);
  const h1 = ((await pg.locator("h1").first().textContent().catch(() => "")) ?? "").trim();
  let verdict;
  if (/didn.{0,3}t load/i.test(txt)) verdict = "❌ crash screen (its scripts are missing)";
  else if (/You.{0,3}re offline/i.test(body)) verdict = "❌ offline notice (this screen was never saved)";
  else if (tabs === 0) verdict = "❌ nothing rendered";
  else verdict = `✓ ${h1 ? JSON.stringify(h1.slice(0, 32)) : "the app"}`;
  if (verdict.startsWith("❌")) failures++;
  console.log(`   ${label.padEnd(16)} ${pg.url().replace(`https://${HOST}`, "").padEnd(16)} ${verdict}`);
}

pg = await ctx.newPage(); // a cold launch, as if the app had been closed
await pg.goto(`https://${HOST}/`, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => {});
await look("icon launch");
for (const [label, sel] of [
  ["Checklist", 'a[href="/checklist"]'], ["Handover", 'a[href="/handover"]'],
  ["Accident", 'a[href="/accident/new"]'], ["Start trip", 'a[href="/trip/start"]'],
  ["Home", 'a[href="/home"]'],
]) {
  const el = pg.locator(sel).first();
  if (!(await el.count())) { failures++; console.log(`   ${label.padEnd(16)} ❌ link missing`); continue; }
  await el.click({ timeout: 15000 }).catch(() => {});
  await look(label);
}

console.log(failures === 0 ? "\n✓ the app works with no signal" : `\n❌ ${failures} problem(s)`);
await browser.close(); proxy.server.close();
process.exit(failures === 0 ? 0 : 1);
