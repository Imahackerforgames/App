/* Saved, Compare, and getting there from Saturation.

   Three bugs this covers, all of which looked like "the feature does
   nothing": Compare resolved saved titles through the catalog and silently
   dropped anything it could not find, saved rows were click-gated on the
   same lookup, and Saturation handed the detail sheet a no-op `put` so its
   Save button wrote nowhere. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

async function app({ watchlist = [], soldDates = [], datesByMarket = null,
                     activeTitle = "Totally Made Up Widget 9000" } = {}) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ plan: "pro", expires_at: null }]) }));
  await page.route(/\/functions\/v1\/product-search/, (r) => {
    const body = r.request().postDataJSON() || {};
    if (body.sold) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      count: 11, markets: ["eBay","Mercari"], marketCounts: { eBay: 7, Mercari: 4 },
      soldDates, datedCount: soldDates.length,
      datesByMarket: datesByMarket ?? (soldDates.length ? { eBay: soldDates } : {}),
      results: [], retrievedAt: new Date().toISOString() }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      count: 12, markets: ["eBay"], marketCounts: { eBay: 12 },
      results: [{ title: activeTitle, url: "https://www.ebay.com/itm/1",
                  market: "eBay", snippet: "", image: null }],
      retrievedAt: new Date().toISOString() }) });
  });
  await page.route(/\/functions\/v1\/ai-assistant/, (r) => r.fulfill({ status: 402, body: '{"error":"no"}' }));
  await page.addInitScript((wl) => {
    localStorage.setItem("ros:session", JSON.stringify({ email:"t@e.com", provider:"email", token:"t", id:"u1", refresh:"r", expiresAt: Math.floor(Date.now()/1000)+3600 }));
    localStorage.setItem("ros:profile", JSON.stringify({ username: "tester", onboarded: true, theme:"obsidian", state:"CA", zip:"90001", radius:25 }));
    if (wl.length) localStorage.setItem("ros:watchlist", JSON.stringify(wl));
  }, watchlist);
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const openSaved = async (page) => {
  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Saved$/ }).click();
  await page.waitForTimeout(500);
};

// ── 1. Compare keeps a searched product instead of dropping it ─────────
{
  console.log("\n1. Compare no longer loses products it can't find in the catalog");
  /* One catalog product, one that came out of a search. The searched one is
     exactly what used to vanish. */
  const { ctx, page } = await app({ watchlist: [
    { title: "Dior Sauvage EDT 100ml", cat: "Colognes" },
    { title: "Totally Made Up Widget 9000", cat: "Other", comp: null, vel: null,
      sellers: null, comps90: null, trend: "flat" },
  ] });
  await openSaved(page);

  ok("both saved products are listed",
     await page.getByRole("button", { name: /^Select$/ }).count() === 2,
     String(await page.getByRole("button", { name: /^Select$/ }).count()));
  /* The label flips to Deselect on click, so re-query rather than holding
     handles to a list that renames itself. */
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /^Select$/ }).first().click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: /^Compare \(2\)$/ }).click();
  await page.waitForTimeout(600);

  const sheet = await page.locator("body").innerText();
  ok("the sheet counts both, not zero", /2 products/.test(sheet), sheet.match(/\d+ products/)?.[0]);
  ok("the catalog product is there", /Dior Sauvage EDT 100ml/.test(sheet));
  ok("and so is the searched one", /Totally Made Up Widget 9000/.test(sheet));
  ok("which says why it has no numbers yet", /no reference data behind it yet/i.test(sheet));
  ok("rather than pretending to a verdict", /NOT ENOUGH DATA/.test(sheet));
  /* "flat" is the placeholder a searched product is saved with. Four
     Unknowns is the honest row; three Unknowns and a Flat is not. */
  /* The title appears twice — once in the saved list, once as a compare
     card — so the card's own content is the last segment. */
  const widgetCard = sheet.split("Totally Made Up Widget 9000").pop();
  ok("and not claiming a flat trend it never measured",
     (widgetCard.match(/Unknown/g) || []).length === 4, widgetCard.slice(0, 200));
  await ctx.close();
}

// ── 2. a searched product in Saved can actually be opened ──────────────
{
  console.log("\n2. A searched product in Saved opens");
  const { ctx, page } = await app({
    watchlist: [{ title: "Totally Made Up Widget 9000", cat: "Other", trend: "flat" }],
    soldDates: [1, 2, 3, 5, 12, 26].map(daysAgo),
  });
  await openSaved(page);
  await page.getByText("Totally Made Up Widget 9000").first().click();
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  ok("the detail sheet opened", /What We Analyzed/i.test(body));
  ok("and it measured the product", /Measured just now/i.test(body));
  await ctx.close();
}

// ── 3. Saving from Saturation reaches Saved ────────────────────────────
{
  console.log("\n3. Save on a Saturation product reaches the Saved tab");
  const { ctx, page } = await app({});
  await page.getByRole("button", { name: /^Saturation$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /See More/ }).first().click();
  await page.waitForTimeout(2200);

  const title = await page.locator('[role="dialog"][aria-modal="true"] h2, [role="dialog"][aria-modal="true"] h1').first().innerText().catch(() => "");
  await page.getByRole("button", { name: /Save to watchlist/ }).click();
  await page.waitForTimeout(600);
  const after = await page.locator("body").innerText();
  ok("the button confirms the save", /Saved ✓/.test(after), after.match(/Save[^\n]{0,20}/)?.[0]);

  const stored = await page.evaluate(() => localStorage.getItem("ros:u:u1:watchlist"));
  ok("and it was actually written to storage", stored && JSON.parse(stored).length === 1, String(stored));
  ok("with the product's own numbers, not just its name",
     stored && "vel" in JSON.parse(stored)[0] && "comp" in JSON.parse(stored)[0], String(stored));

  await page.getByRole("button", { name: /^Close$/ }).click().catch(() => {});
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await openSaved(page);
  const saved = await page.locator("body").innerText();
  ok("it shows up in Saved", title ? saved.includes(title) : !/Nothing saved yet/.test(saved),
     `${title} | ${saved.slice(0, 120)}`);
  ok("and Saved is no longer empty", !/Nothing saved yet/.test(saved));
  await ctx.close();
}

// ── 4. the sold line now reaches catalog-backed products ───────────────
{
  console.log("\n4. AI Discover and Product Search products get the real line too");
  const { ctx, page } = await app({
    watchlist: [{ title: "Dior Sauvage EDT 100ml", cat: "Colognes" }],
    soldDates: [1, 2, 3, 5, 8, 12, 19, 26].map(daysAgo),
    datesByMarket: { eBay: [1, 3, 5, 12, 19].map(daysAgo), Mercari: [2, 8, 26].map(daysAgo) },
  });
  await openSaved(page);
  await page.getByText("Dior Sauvage EDT 100ml").first().click();
  await page.waitForTimeout(2600);
  const body = await page.locator("body").innerText();

  ok("a catalog product is measured now", /Measured just now/i.test(body));
  ok("and charts its real sales", await page.locator('svg[role="img"][aria-label^="Sold activity"]').count() === 1);
  ok("with the counted breakdown", /eBay\s*5/.test(body) && /Mercari\s*3/.test(body),
     body.match(/eBay[\s\S]{0,40}/)?.[0]);
  ok("and drops the modelled wording", !/curve models the trend direction/i.test(body));
  ok("saying where the dates came from", /stated their own sale date/i.test(body));

  /* The catalog's own 90-day reference data still drives the judgement
     tiles — a twenty-listing sample must not overwrite it. The catalog path
     shows a Trend tile; the measured path replaces it with Marketplaces, so
     which one is on screen says which data won. */
  /* innerText returns the labels as rendered, and the card labels are
     uppercased in CSS — so these have to be case-insensitive. */
  const tiles = body.split(/measured just now/i)[0];
  ok("the catalog still drives the verdict tiles, not the 20-listing sample",
     /\bTREND\b/i.test(tiles) && !/\bMARKETPLACES\b/i.test(tiles), tiles.slice(-220));
  await ctx.close();
}

// ── 5. the same, reached the way the user reaches it ───────────────────
{
  console.log("\n5. Straight through Product Search");
  const { ctx, page } = await app({
    activeTitle: "Dior Sauvage EDT 100ml",
    soldDates: [1, 2, 4, 6, 9, 15, 24].map(daysAgo),
    datesByMarket: { eBay: [1, 4, 9, 15].map(daysAgo), Mercari: [2, 6, 24].map(daysAgo) },
  });
  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Product Search/ }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder(/Jordan 4 Black Cat, PS5/).fill("Dior Sauvage EDT 100ml");
  await page.getByRole("button", { name: /^Go$/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Analyze$/ }).first().click();
  await page.waitForTimeout(2600);

  const body = await page.locator("body").innerText();
  ok("the line is drawn from Product Search", await page.locator('svg[role="img"][aria-label^="Sold activity"]').count() === 1);
  ok("over the three windows", /\b7d\b/.test(body) && /\b3w\b/.test(body) && /\b30d\b/.test(body));
  ok("and the breakdown adds up",
     Number(body.match(/eBay\s*(\d+)/)?.[1] ?? 0) + Number(body.match(/Mercari\s*(\d+)/)?.[1] ?? 0)
       === Number(body.match(/Sold in the last 30 days\s*(\d+)/)?.[1] ?? -1),
     body.match(/eBay[\s\S]{0,120}/)?.[0]);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
