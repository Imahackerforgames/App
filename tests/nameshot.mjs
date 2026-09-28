/* Before and after, as a picture. Diagnostic, not an assertion — tests/names.mjs
   is what actually holds the behaviour in place. */
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { chromium } from "playwright";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");

const src = readFileSync("/home/user/App/supabase/functions/product-search/index.ts", "utf8");
const a = src.indexOf("const stripPrices");
const b = src.indexOf("/* Describes the key", a);
const js = transformSync(src.slice(a, b) + "\nexport { genericName, cleanTitle };",
  { loader: "ts", target: "es2022", format: "esm" }).code;
const { genericName, cleanTitle } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

/* Written the way sellers write them. */
const LISTINGS = [
  "NEW🔥 Nike Air Jordan 4 Retro Black Cat 2020 CU1110-010 Mens Sz 10.5 DS 100% Authentic FAST SHIP | eBay",
  "NWT Lululemon Align High-Rise Leggings 25\" Black Size 6 - FREE SHIPPING",
  "Sony PlayStation 5 Digital Edition Console ✅ IN HAND ✅ SHIPS SAME DAY - eBay",
  "Lot of 3 Vera Bradley Tote Bags (Pre-owned, excellent condition) L@@K",
  "KITCHENAID STAND MIXER ARTISAN SERIES 5QT RARE HTF MUST SEE",
  "Apple AirPods Pro 2nd Generation MTJV3AM/A BNIB Sealed US Seller",
  "New Balance 550 White Green Size 9.5 - Poshmark",
  "Stanley Quencher H2.0 40oz Tumbler ⭐ Brand New With Tags ⭐",
];

const rows = LISTINGS.map((l) => ({ before: cleanTitle(l), after: genericName(l) }));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#0B0708;color:#F5EFEE;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:28px}
  h1{font-size:19px;margin:0 0 4px} .sub{color:#A08F8F;font-size:12.5;margin:0 0 22px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:14px 0;border-top:1px solid #241d1e}
  .lab{font-size:10px;letter-spacing:.12em;color:#6d5d5e;text-transform:uppercase;margin-bottom:6px}
  .before{color:#8b7b7c;font-size:12.5}
  .after{color:#F5EFEE;font-weight:650;font-size:14.5}
  .head{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding-bottom:8px}
  .head div{font-size:10px;letter-spacing:.12em;color:#6d5d5e;text-transform:uppercase}
</style>
<h1>Product names in search results</h1>
<p class="sub">Left: the listing title as the seller wrote it. Right: what the card shows now.</p>
<div class="head"><div>Before</div><div>After</div></div>
${rows.map((r) => `<div class="row"><div class="before">${esc(r.before)}</div><div class="after">${esc(r.after)}</div></div>`).join("")}`;

writeFileSync("/tmp/claude-0/names.html", html);
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await br.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 2 })).newPage();
await page.goto("file:///tmp/claude-0/names.html");
await page.screenshot({ path: "/home/user/App/names-before-after.png", fullPage: true });
await br.close();
console.log("wrote names-before-after.png");
