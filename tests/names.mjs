/* Listing titles turned into product names.

   Sellers write adverts, not product names. Two listings for the same shoe
   arrive as two different-looking things, and a screen meant for comparing
   products ends up reading like a marketplace feed.

   The risk in cleaning them is over-cleaning. Most of this file is the
   traps rather than the happy path, because a name that loses its brand is
   worse than one that keeps some noise: "New Balance 550" becoming
   "Balance 550" is unsearchable and looks like a different product. */
import { createRequire } from "module";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

/* The function is a const inside the Edge Function, which is Deno and full
   of top-level awaits. Lift just the pieces this needs. */
const src = readFileSync("/home/user/App/supabase/functions/product-search/index.ts", "utf8");
const slice = (from, to) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if (a === -1 || b === -1) throw new Error(`could not find ${from}`);
  return src.slice(a, b);
};
const js = transformSync(
  slice("const stripPrices", "/* Describes the key") + "\nexport { genericName, cleanTitle };",
  { loader: "ts", target: "es2022", format: "esm" },
).code;
const { genericName } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

const t = (input, expected, label) =>
  ok(label || expected, genericName(input) === expected, `got "${genericName(input)}"`);

/* ── 1. the traps ───────────────────────────────────────────────────────
   "New" is a brand. So is "DS", inside Nintendo DS. Anything that strips
   words by spelling alone eventually eats one of these. */
console.log("\n1. Brands that look like seller-speak");
t("New Balance 550 White Green", "New Balance 550 White Green");
t("New Era 59Fifty New York Yankees Cap", "New Era 59Fifty New York Yankees Cap");
t("Nintendo DS Lite Console", "Nintendo DS Lite Console");
t("Nintendo DSi XL", "Nintendo DSi XL");
{
  /* "Brand New" is unambiguous and goes; the brand behind it must not. */
  const got = genericName("Brand New New Balance 990v5");
  ok("'Brand New' goes, 'New Balance' stays", got === "New Balance 990v5", `got "${got}"`);
}

console.log("\n2. Ordinary names are left alone");
t("Sony PlayStation 5 Digital Edition", "Sony PlayStation 5 Digital Edition");
t("Dyson Airwrap Complete", "Dyson Airwrap Complete");
t("Apple AirPods Pro 2nd Generation", "Apple AirPods Pro 2nd Generation");
t("Stanley Quencher H2.0 40oz Tumbler", "Stanley Quencher H2.0 40oz Tumbler");

/* ── 3. what this exists to remove ──────────────────────────────────── */
console.log("\n3. Seller-speak comes off");
t("NWT Lululemon Align Leggings", "Lululemon Align Leggings");
t("Nike Air Force 1 Low White Size 10.5", "Nike Air Force 1 Low White");
t("Jordan 4 Retro Black Cat Mens Sz 11", "Jordan 4 Retro Black Cat");
t("Coach Tabby Shoulder Bag 100% Authentic", "Coach Tabby Shoulder Bag");
t("Ugg Classic Mini Boots FREE SHIPPING", "Ugg Classic Mini Boots");
t("Pokemon Charizard Card RARE HTF", "Pokemon Charizard Card");
t("Air Jordan 1 Chicago (Pre-owned, great condition)", "Air Jordan 1 Chicago");
t("Lot of 3 Vera Bradley Tote Bags", "Vera Bradley Tote Bags");

console.log("\n4. Style codes and emoji");
t("Nike Dunk Low Panda DD1391-100", "Nike Dunk Low Panda");
t("🔥 Yeezy Boost 350 V2 Zebra 🔥", "Yeezy Boost 350 V2 Zebra");
t("Adidas Samba OG ✅ IE3439 ⭐", "Adidas Samba OG");

/* Both of these were found by looking at the rendered before/after, not by
   writing tests — which is the argument for always rendering it. */
console.log("\n4b. Fragments left behind by other removals");
t("Stanley Quencher H2.0 40oz Tumbler ⭐ Brand New With Tags ⭐", "Stanley Quencher H2.0 40oz Tumbler",
  "'Brand New With Tags' leaves nothing behind");
t("Nike Dunk Low Panda New In Box", "Nike Dunk Low Panda");
t("Coach Willow Tote NWT with tags", "Coach Willow Tote");

console.log("\n5. Shouting becomes a name");
{
  const got = genericName("KITCHENAID STAND MIXER ARTISAN SERIES");
  ok("all-caps is title-cased", got === "Kitchenaid Stand Mixer Artisan Series", `got "${got}"`);
  /* Units and model numbers are capitalised deliberately. Lower-casing
     them made "5QT" read as "5qt", which looks like a typo on a card
     trying to look like a catalogue. */
  {
    const u = genericName("KITCHENAID STAND MIXER ARTISAN SERIES 5QT");
    ok("but a capacity keeps its capitals", /5QT/.test(u), u);
  }
  {
    const u = genericName("NINJA AIR FRYER MAX XL 5.5QT BLACK");
    ok("and so does a size in the middle of a shout", /5\.5QT/.test(u), u);
  }
  /* But a title with any lower case is left alone, so real capitalisation
     survives. */
  t("Apple iPhone 15 Pro Max", "Apple iPhone 15 Pro Max");
  t("Sony WH-1000XM5 Headphones", "Sony WH-1000XM5 Headphones");
}

/* ── 6. the whole point ─────────────────────────────────────────────────
   Two adverts for one shoe have to stop reading like two different things.

   Not identical, though — that was the first version of this test and it
   was wrong. One seller writes "Black Cat 2020" and another just "Black
   Cat", and the year is a real distinction: the 2020 retro and the 2006
   original are different shoes at different prices. Collapsing them would
   be a worse error than leaving them apart. What has to go is the
   seller-speak. */
console.log("\n6. Two listings for one product read as products");
{
  const a = genericName("NEW🔥 Nike Air Jordan 4 Retro Black Cat 2020 CU1110-010 Mens Sz 10.5 DS 100% Authentic FAST SHIP");
  const b = genericName("Nike Air Jordan 4 Retro Black Cat — Size 9 — Pre-owned, excellent condition");
  const SPEAK = /\b(?:new|ds|nwt|authentic|fast|ship\w*|sz|size|mens?|pre[\s-]?owned|excellent|condition)\b|[🔥]|\d{4}-\d{3}/i;

  ok("the advert is gone from the first", !SPEAK.test(a), a);
  ok("and from the second", !SPEAK.test(b), b);
  ok("both are recognisably the same shoe", a.startsWith(b) || b.startsWith(a), `"${a}" vs "${b}"`);
  ok("the year survives, because it is a real distinction", /2020/.test(a), a);
}

/* ── 7. it must never return nothing ────────────────────────────────────
   A title that is pure advertising would clean down to an empty string,
   and an empty card is worse than a noisy one. */
console.log("\n7. Never blank");
for (const junk of ["🔥🔥🔥", "FREE SHIPPING", "NWT 100% Authentic", "L@@K RARE HTF", "", "   "]) {
  const got = genericName(junk);
  ok(`"${junk.slice(0, 18)}" does not vanish`, got.length > 0 || junk.trim() === "", `got "${got}"`);
}

console.log("\n8. Length is capped without leaving a word half-cut");
{
  const long = "Apple MacBook Pro 16 inch M3 Max 48GB Unified Memory 1TB SSD Space Black Laptop Computer";
  const got = genericName(long);
  ok("shortened", got.length <= 60, `${got.length} chars`);
  ok("and not mid-word", !long.slice(got.length, got.length + 1).match(/\w/) || got.endsWith(long.slice(0, got.length).split(" ").pop()),
     `"${got}"`);
  ok("still starts with the product", /^Apple MacBook Pro/.test(got), got);
}

/* Prices must never survive into a name — the app may not show a figure
   the user did not enter. */
console.log("\n9. No prices leak through");
for (const p of ["Nike Dunk Low $120 OBO", "Coach Bag - $45.99 shipped"]) {
  ok(`no figure in "${p.slice(0, 22)}"`, !/\$|\d+\.\d{2}/.test(genericName(p)), genericName(p));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
