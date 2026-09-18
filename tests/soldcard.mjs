import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Opens the detail sheet for a product that is NOT in the catalog — i.e. one
   that came from a live search — with product-search answering as it really
   does: an active pass and a sold pass, each with per-marketplace counts. */
async function sheet({ soldResults, activeResults = 12 }) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ plan: "pro", expires_at: null }]) }));
  await page.route(/\/functions\/v1\/product-search/, (r) => {
    const body = r.request().postDataJSON() || {};
    if (body.sold) {
      const counts = soldResults;
      const total = Object.values(counts).reduce((a, n) => a + n, 0);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        count: total, markets: Object.keys(counts), marketCounts: counts,
        results: [], retrievedAt: new Date().toISOString() }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      count: activeResults, markets: ["eBay"], marketCounts: { eBay: activeResults },
      results: [{ title: "Totally Made Up Widget 9000", url: "https://www.ebay.com/itm/1",
                  market: "eBay", snippet: "", image: null }],
      retrievedAt: new Date().toISOString() }) });
  });
  await page.route(/\/functions\/v1\/ai-assistant/, (r) => r.fulfill({ status: 402, contentType: "application/json", body: '{"error":"no"}' }));
  await page.addInitScript(() => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@e.com", provider: "email", token: "t", id: "u1", refresh: "r", expiresAt: Math.floor(Date.now()/1000)+3600 }));
    localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  /* Reached through Product Search, because that is the only route to a
     product with no catalog row behind it — Saved can only open catalog
     items. */
  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Product Search/ }).click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder(/Jordan 4 Black Cat, PS5/).fill("Totally Made Up Widget 9000");
  await page.getByRole("button", { name: /^Go$/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Analyze$/ }).first().click();
  await page.waitForTimeout(2200);
  return { ctx, page };
}

console.log("\nA live-searched product with sold listings found");
{
  const { ctx, page } = await sheet({ soldResults: { eBay: 9, Mercari: 4, Depop: 1 } });
  const body = await page.locator("body").innerText();
  ok("no longer says 'No reliable sold data'", !/No reliable sold data/i.test(body), body.slice(0, 200));
  ok("shows the counted total", /\b14\b/.test(body), body.match(/.{0,40}sold listings.{0,40}/)?.[0]);
  ok("names it as listings found, not sales", /sold listings found/i.test(body));
  ok("breaks it down by marketplace",
     /eBay/.test(body) && /Mercari/.test(body) && /Depop/.test(body));
  ok("says search misses sales, so it is a floor", /floor/i.test(body));
  ok("does not claim a time range", !/sold, last \d+ days/i.test(body));
  ok("hides the 7d/30d/90d chips for counted data",
     (await page.getByRole("button", { name: /^30d$/ }).count()) === 0);
  await page.screenshot({ path: "shot-soldcard.png" });
  await ctx.close();
}

console.log("\nWhen the search is capped");
{
  const { ctx, page } = await sheet({ soldResults: { eBay: 20 } });
  const body = await page.locator("body").innerText();
  ok("marks the number as a floor with a +", /20\+/.test(body), body.match(/.{0,30}20.{0,30}/)?.[0]);
  ok("and says the real number is higher", /real number is higher/i.test(body));
  await ctx.close();
}

console.log("\nWhen nothing sold was found");
{
  const { ctx, page } = await sheet({ soldResults: {} });
  const body = await page.locator("body").innerText();
  ok("falls back to saying so honestly", /No reliable sold data/i.test(body));
  ok("invents no chart", !/eBay\s*\n?\s*\d/.test(body.split("Recent sold activity")[1] || ""));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
