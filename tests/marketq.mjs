/* What a marketplace link actually searches for.

   The bug this file exists to stop coming back: the Sources links handed a
   whole listing title to Mercari with the sold filter on, matched nothing,
   and showed an empty page. An empty page is not a null result — it reads
   as "this product has never sold", which is a claim nobody measured.

   Most of these assertions are the traps rather than the happy path,
   because over-trimming is the worse failure. "Air Max 90" losing its 90 is
   a different shoe; "Nike Tech Fleece Hoodie L" keeping its L is just a
   search that finds less. */
import { createRequire } from "module";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

/* Same slice names.mjs takes, for the same reason: importing App.jsx would
   pull in React, lucide and the whole app. Anchored on declarations, never
   on prose, so deleting a comment cannot silently delete these tests. */
const src = readFileSync("/home/user/App/src/App.jsx", "utf8");
const a = src.indexOf("const stripPrices");
const b = src.indexOf("const COMMAS_CHECKOUT_FN", a);
if (a === -1 || b === -1) throw new Error("could not find marketQuery in App.jsx");
const js = transformSync(
  src.slice(a, b) + "\nexport { marketQuery, genericName };",
  { loader: "jsx", target: "es2022", format: "esm" },
).code;
const { marketQuery } = await import("data:text/javascript," + encodeURIComponent(js));

const is = (title, want) =>
  ok(`${JSON.stringify(title)} -> ${JSON.stringify(want)}`, marketQuery(title) === want, marketQuery(title));

console.log("\nSizes come off — the listing's, not the product's");
is("Jordan 1 Low Panda US 9", "Jordan 1 Low Panda");
is("Nike Tech Fleece Hoodie L", "Nike Tech Fleece Hoodie");
is("New Balance 550 White Green Mens Size 10.5", "New Balance 550 White Green");
is("Lululemon Define Jacket Black Womens 6 NWT", "Lululemon Define Jacket Black");
is("Patagonia Better Sweater Fleece Jacket Mens Medium Grey Full Zip",
   "Patagonia Better Sweater Fleece Jacket Grey");

console.log("\nA number at the end is part of the name until a word says otherwise");
is("Nike Air Max 90", "Nike Air Max 90");
is("Chanel No 5 Eau de Parfum 100ml", "Chanel No 5 Eau de Parfum");
is("Asics Gel-Kayano 14 Silver", "Asics Gel-Kayano 14 Silver");
is("Stanley Quencher 40oz", "Stanley Quencher 40oz");
is("Versace Eros EDT 100ml", "Versace Eros EDT 100ml");

console.log("\nNames that are already basic are left alone");
is("Apple AirPods Pro 2nd Generation", "Apple AirPods Pro 2nd Generation");
is("PS5 Console Disc Edition", "PS5 Console Disc Edition");
is("Carhartt Acrylic Watch Hat", "Carhartt Acrylic Watch Hat");
is("Jean Paul Gaultier Le Male 125ml", "Jean Paul Gaultier Le Male 125ml");

console.log("\nSeller advertising and marketplace tails");
is("NEW\u{1F525} Nike Tech Fleece Full Zip Hoodie Grey Mens Large RARE",
   "Nike Tech Fleece Full Zip Hoodie");
is("Air Jordan 4 Retro Bred CT8527-016 Mens 11 - eBay", "Air Jordan 4 Retro Bred");

console.log("\nThe query is never empty, never longer than a query");
for (const t of ["", "   ", "L", "Mens Large", "\u{1F525}\u{1F525}\u{1F525}", null, undefined]) {
  const q = marketQuery(t);
  ok(`${JSON.stringify(t)} never yields a runaway query`, typeof q === "string" && q.length <= 60, q);
}
ok("a long title is cut to something a search box accepts",
   marketQuery("Vintage 1990s Polo Ralph Lauren Cookie Crest Spell Out Quarter Zip Sweater Navy Blue Mens XL").length <= 48,
   marketQuery("Vintage 1990s Polo Ralph Lauren Cookie Crest Spell Out Quarter Zip Sweater Navy Blue Mens XL"));
ok("no trailing size word survives the cut",
   !/\s(?:mens?|womens?|sz|size|us|uk|eu)$/i.test(marketQuery("Patagonia Better Sweater Fleece Jacket Mens Medium Grey Full Zip")));

console.log("\nEvery marketplace link goes through it");
const app = src;
for (const site of [
  "MARKETS[c.source]?.url?.(marketQuery(c.title))",
  "MARKETS[MARKET_KEY_BY_LABEL[label]].url(marketQuery(title))",
  "MARKETS[MARKET_KEY_BY_LABEL[label]]?.url?.(marketQuery(item.title))",
  "m.url(marketQuery(item.title), db.profile)",
]) ok(`link built with marketQuery: ${site.slice(0, 44)}`, app.includes(site));
ok("no marketplace link still passes a raw title",
   !/\.url\??\.?\((?:item\.|c\.)?title[,)]/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
