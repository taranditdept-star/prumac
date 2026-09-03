/**
 * Builds the driver reminder flyer.
 *
 *   node scripts/make-driver-flyer.mjs [outDir]
 *
 * Produces an A4 PDF for printing and pinning up, and a portrait PNG for
 * sending on WhatsApp. The PDF is rendered by Chromium, so every word in it is
 * vector text and stays sharp at any size — the only raster element is the
 * logo, which public/brand/logo-prumac.png supplies at just 140x50px. Replace
 * that file with the original artwork and this script produces a flyer that is
 * sharp throughout, with no other change.
 *
 * Brand colours are taken from the logo's own pixels, not guessed:
 * red rgb(255,1,38) and navy rgb(2,1,129).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] ?? path.join(ROOT, "handover");
const LOGO = path.join(ROOT, "public", "brand", "logo-prumac.png");

const RED = "#FF0126";
const NAVY = "#020181";

const SUPPORT = {
  name: "Mr Micaiah",
  role: "Application Technical Support",
  phone: "+263 784 626 199",
};

const logo = `data:image/png;base64,${fs.readFileSync(LOGO).toString("base64")}`;

/** One numbered instruction. `note` is the fine print under the how-to. */
const STEPS = [
  {
    n: "1",
    title: "Sign in every day",
    how: "Open PRUMAC Connect and sign in with your Driver&nbsp;ID and password.",
    note: "Your Driver ID is your PMD number — PMD001, PMD014, and so on. Signing in marks your attendance for the day.",
    icon: `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>`,
  },
  {
    n: "2",
    title: "Log every trip",
    how: "Start the trip <b>before</b> you drive off. End it when you park.",
    note: "Do the vehicle checklist first, then enter the odometer reading and photograph it. A trip that was never started cannot be ended later.",
    icon: `<path d="M2 6.2h11v10H2z"/><path d="M13 9.6h3.9L20.3 13v3.2h-7.3z"/><circle cx="6.6" cy="18.7" r="1.85"/><circle cx="16.6" cy="18.7" r="1.85"/>`,
  },
  {
    n: "3",
    title: "Report every fault",
    how: "Anything broken, leaking, worn or not working — report it the same day.",
    note: "Brakes, tyres, lights, wipers, warning lamps, strange noises. A small fault reported today is a repair; ignored, it becomes a breakdown on the road.",
    icon: `<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>`,
  },
  {
    n: "4",
    title: "Log every repair you pay for",
    how: "Paid for a repair or a part out of your own pocket? Log it and photograph the receipt.",
    note: "The accountant reviews the claim and reimburses it. No receipt in the app means no record — and no refund.",
    icon: `<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z"/><path d="M9 8h6"/><path d="M9 12h6"/>`,
  },
];

const step = (s) => `
  <li class="step">
    <span class="num">${s.n}</span>
    <span class="ico">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
           stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
    </span>
    <span class="body">
      <span class="title">${s.title}</span>
      <span class="how">${s.how}</span>
      <span class="note">${s.note}</span>
    </span>
  </li>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PRUMAC driver reminder</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 794px; height: 1123px; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #15161c; background: #fff;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column;
    padding: 34px 42px 0;
  }

  /* ── masthead ─────────────────────────────────────────────────────────── */
  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
  /* 132px keeps the 140px-wide source close to 1:1, so it stays crisp. */
  header img { width: 132px; height: 47px; display: block; }
  .kicker { text-align: right; line-height: 1.25; }
  .kicker b {
    display: block; font-size: 12.5px; letter-spacing: .19em;
    text-transform: uppercase; color: ${NAVY}; font-weight: 800;
  }
  .kicker span { display: block; font-size: 10.5px; color: #7a7f8c; letter-spacing: .04em; }
  .rule { height: 5px; margin: 13px 0 0; display: flex; border-radius: 3px; overflow: hidden; }
  .rule i { flex: 1; background: ${RED}; }
  .rule i + i { flex: 2.1; background: ${NAVY}; }

  /* ── headline ─────────────────────────────────────────────────────────── */
  .hero {
    margin-top: 18px; background: ${NAVY}; border-radius: 16px;
    padding: 20px 30px 22px; color: #fff;
  }
  .hero h1 {
    font-size: 42px; line-height: .98; font-weight: 900;
    font-style: italic; letter-spacing: -.018em;
  }
  .hero h1 em {
    font-style: italic; display: inline-block; margin-top: 6px;
    background: ${RED}; color: #fff; padding: 1px 13px 4px; border-radius: 8px;
  }
  .hero p { margin-top: 10px; font-size: 14px; line-height: 1.45; color: #c3c6ea; max-width: 61ch; }

  /* ── the four steps ───────────────────────────────────────────────────── */
  ol { list-style: none; margin-top: 17px; display: flex; flex-direction: column; gap: 10px; }
  .step {
    display: grid; grid-template-columns: 50px 44px 1fr; align-items: start; gap: 15px;
    border: 1.6px solid #e3e5ec; border-left: 5px solid ${RED};
    border-radius: 13px; padding: 16px 18px 17px;
  }
  .step:nth-child(even) { border-left-color: ${NAVY}; }
  .num {
    font-size: 37px; font-weight: 900; font-style: italic; line-height: .9;
    color: ${RED}; text-align: center; letter-spacing: -.04em;
  }
  .step:nth-child(even) .num { color: ${NAVY}; }
  .ico {
    width: 44px; height: 44px; border-radius: 11px; background: #f4f5f9;
    display: flex; align-items: center; justify-content: center; color: ${NAVY};
  }
  .ico svg { width: 25px; height: 25px; }
  .body { display: block; padding-top: 1px; }
  .title { display: block; font-size: 19.5px; font-weight: 800; letter-spacing: -.012em; }
  .how { display: block; margin-top: 4px; font-size: 13.6px; line-height: 1.4; color: #2c2f3a; }
  .how b { font-weight: 800; }
  .note { display: block; margin-top: 4px; font-size: 11.3px; line-height: 1.38; color: #797e8c; }

  /* ── the point of it all ──────────────────────────────────────────────── */
  .punch {
    margin-top: 14px; background: ${RED}; color: #fff; border-radius: 13px;
    padding: 14px 22px; display: flex; align-items: center; gap: 16px;
  }
  .punch strong { font-size: 21px; font-weight: 900; font-style: italic; white-space: nowrap; }
  .punch span { font-size: 12.4px; line-height: 1.4; color: #ffe1e6; }

  /* ── footer ───────────────────────────────────────────────────────────── */
  footer { margin-top: auto; padding: 13px 0 16px; }
  .offline {
    display: flex; align-items: center; gap: 11px; margin-bottom: 11px;
    font-size: 12.2px; line-height: 1.4; color: #4b5060;
    background: #f4f5f9; border-radius: 11px; padding: 11px 15px;
  }
  .offline svg { width: 18px; height: 18px; color: ${NAVY}; flex: none; }
  .offline b { color: #15161c; font-weight: 800; }
  .help {
    border: 2px solid ${NAVY}; border-radius: 13px; padding: 13px 20px;
    display: flex; align-items: center; justify-content: space-between; gap: 18px;
  }
  .help .who span {
    display: block; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase;
    color: ${RED}; font-weight: 800; margin-bottom: 3px;
  }
  .help .who b { display: block; font-size: 17.5px; font-weight: 800; letter-spacing: -.01em; }
  .help .who i { display: block; font-style: normal; font-size: 11.8px; color: #797e8c; margin-top: 1px; }
  .help .tel { text-align: right; }
  .help .tel b {
    display: block; font-size: 25px; font-weight: 900; color: ${NAVY};
    letter-spacing: -.014em; white-space: nowrap;
  }
  .help .tel span { display: block; font-size: 10.8px; color: #797e8c; margin-top: 2px; }
  .foot { margin-top: 9px; text-align: center; font-size: 10px; color: #9aa0ad; letter-spacing: .03em; }
</style></head>
<body>
  <header>
    <img src="${logo}" alt="PRUMAC Connect">
    <span class="kicker">
      <b>Driver reminder</b>
      <span>Ensign Holdings &middot; Zimbabwe &amp; South Africa</span>
    </span>
  </header>
  <div class="rule"><i></i><i></i></div>

  <section class="hero">
    <h1>Four things.<br><em>Every&nbsp;day.</em></h1>
    <p>The app is how the office knows the fleet is running, how your mileage and
       fuel are worked out, and how your claims get paid. Keep it fed and it works for you.</p>
  </section>

  <ol>${STEPS.map(step).join("")}</ol>

  <div class="punch">
    <strong>Not in the app?</strong>
    <span>Then as far as the office, the accountant and the workshop are concerned, it did not happen.
          Log it while you remember it — not at the end of the week.</span>
  </div>

  <footer>
    <p class="offline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5.5 12.4a10 10 0 0 1 13 0"/>
        <path d="M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1.1" fill="currentColor" stroke="none"/>
        <path d="M3 3l18 18" stroke-width="2.1"/>
      </svg>
      <span><b>No signal? Carry on.</b> The app still opens and keeps your work on the phone.
        It sends everything to the office by itself as soon as you are back in coverage.
        Open the app once where there is signal first, so it can save your screens.</span>
    </p>

    <div class="help">
      <span class="who">
        <span>Queries &middot; feedback &middot; suggestions</span>
        <b>${SUPPORT.name}</b>
        <i>${SUPPORT.role}</i>
      </span>
      <span class="tel">
        <b>${SUPPORT.phone}</b>
        <span>Call or WhatsApp</span>
      </span>
    </div>
    <p class="foot">PRUMAC CONNECT &middot; prumac.vercel.app &middot; Please keep this notice where drivers can see it</p>
  </footer>
</body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const htmlPath = path.join(OUT, "prumac-driver-flyer.html");
fs.writeFileSync(htmlPath, html, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(500);

// Anything past the page edge would be silently cropped by the PDF, so check.
const overflow = await page.evaluate(() => ({
  height: document.body.scrollHeight,
  width: document.body.scrollWidth,
}));
if (overflow.height > 1123 || overflow.width > 794) {
  console.warn(`  ! content is ${overflow.width}x${overflow.height}, larger than A4 (794x1123) — it will be cropped`);
}

const pngPath = path.join(OUT, "prumac-driver-flyer.png");
await page.screenshot({ path: pngPath });

const pdfPath = path.join(OUT, "prumac-driver-flyer.pdf");
await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });

await browser.close();

for (const f of [pdfPath, pngPath, htmlPath]) {
  console.log(`  ${path.basename(f).padEnd(28)} ${Math.round(fs.statSync(f).size / 1024)} KB`);
}
console.log(`\nwritten to ${OUT}`);
