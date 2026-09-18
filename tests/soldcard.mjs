import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* The sold line itself. Only SoldChart draws one, so its presence is the
   whole question: is the card charting, or handing over to the links? */
const chart = (page) => page.locator('svg[role="img"][aria-label^="Sold activity"]');

/* N days before today, as the function returns it. */
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* Opens the detail sheet for a product that is NOT in the catalog — i.e. one
   that came from a live search — with product-search answering as it really
   does: an active pass and a sold pass, each with per-marketplace counts. */
async function sheet({ soldResults, soldDates = [], activeResults = 12 }) {
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
        soldDates, datedCount: soldDates.length,
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
    localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
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
  ok("the card is shown", /Recent sold activity/i.test(body));
  ok("shows the counted total", /\b14\b/.test(body), body.match(/.{0,40}sold listings.{0,40}/)?.[0]);
  ok("says plainly there is not enough history to chart",
     /Not enough sold history to chart/i.test(body));
  ok("no line is drawn from dateless counts", await chart(page).count() === 0);
  ok("and no window chips are offered for it", !/\b3w\b/.test(body));
  ok("offers each marketplace that had listings",
     /eBay/.test(body) && /Mercari/.test(body) && /Depop/.test(body));

  const links = await page.getByRole("link").all();
  const hrefs = await Promise.all(links.map((l) => l.getAttribute("href")));
  const sold = hrefs.filter((h) => h && /ebay|mercari|depop/i.test(h));
  ok("the links go to the marketplaces", sold.length >= 3, JSON.stringify(hrefs.slice(0, 5)));
  ok("and open in a new tab",
     (await Promise.all(links.slice(0, 3).map((l) => l.getAttribute("target")))).every((t) => t === "_blank"));
  ok("ranked by where the listings were", /eBay[\s\S]{0,60}9 found/.test(body), body.match(/eBay[\s\S]{0,40}/)?.[0]);
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
  ok("the whole card is hidden, not left empty", !/Recent sold activity/i.test(body),
     body.match(/.{0,60}Recent sold activity.{0,60}/)?.[0]);
  ok("the rest of the sheet still renders", /What We Analyzed/i.test(body));
}

console.log("\nWhen the listings did say when they sold");
{
  /* Six dated sales: four inside the last week, two further back. */
  const dates = [1, 2, 3, 5, 12, 26].map(daysAgo);
  const { ctx, page } = await sheet({ soldResults: { eBay: 9, Mercari: 4 }, soldDates: dates });
  const body = await page.locator("body").innerText();

  ok("now it charts", await chart(page).count() === 1);
  ok("and stops saying there is nothing to chart", !/Not enough sold history/i.test(body));
  ok("the three windows are offered", /\b7d\b/.test(body) && /\b3w\b/.test(body) && /\b30d\b/.test(body),
     body.match(/.{0,40}Recent sold activity.{0,60}/)?.[0]);
  ok("no fourth window sneaks in", !/\b90d\b/.test(body));
  ok("30 days is the default and counts all six", /\b6\b[\s\S]{0,40}in the last 30 days/.test(body),
     body.match(/.{0,60}in the last 30 days.{0,20}/)?.[0]);
  ok("it says how many of the listings carried a date",
     /6 of 13/.test(body), body.match(/Counted from.{0,90}/)?.[0]);

  await page.screenshot({ path: "shot-soldchart.png" });

  // 3 weeks drops the 26-day-old sale.
  await page.getByRole("button", { name: /^3w$/ }).click();
  await page.waitForTimeout(500);
  const wk3 = await page.locator("body").innerText();
  ok("3w narrows the count to five", /\b5\b[\s\S]{0,40}in the last 3 weeks/.test(wk3),
     wk3.match(/.{0,60}in the last 3 weeks.{0,20}/)?.[0]);

  // 7 days drops the 12-day-old one too.
  await page.getByRole("button", { name: /^7d$/ }).click();
  await page.waitForTimeout(500);
  const wk1 = await page.locator("body").innerText();
  ok("7d narrows it again to four", /\b4\b[\s\S]{0,40}in the last 7 days/.test(wk1),
     wk1.match(/.{0,60}in the last 7 days.{0,20}/)?.[0]);
  ok("the line is still drawn", await chart(page).count() === 1);
  await ctx.close();
}

console.log("\nWhen only a couple of listings were dated");
{
  const { ctx, page } = await sheet({ soldResults: { eBay: 9, Mercari: 4 }, soldDates: [daysAgo(2), daysAgo(6)] });
  const body = await page.locator("body").innerText();
  ok("two points is not a trend, so no chart", await chart(page).count() === 0);
  ok("it hands over to the marketplaces instead", /Not enough sold history to chart/i.test(body));
  ok("and still shows the counted total", /\b13\b/.test(body), body.match(/.{0,40}sold listings.{0,30}/)?.[0]);
  await ctx.close();
}

console.log("\nWhen every dated sale is older than the widest window");
{
  const dates = [120, 160, 200, 240].map(daysAgo);
  const { ctx, page } = await sheet({ soldResults: { eBay: 9 }, soldDates: dates });
  const body = await page.locator("body").innerText();
  ok("an all-zero line is not drawn", await chart(page).count() === 0);
  ok("the links are shown instead", /Not enough sold history to chart/i.test(body));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
