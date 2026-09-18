/* Runs the real product-search Edge Function in Node with Tavily stubbed,
   so the fan-out can be checked without spending credits or needing Deno. */
import { createRequire } from "module";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const src = readFileSync("/home/user/App/supabase/functions/product-search/index.ts", "utf8")
  .replace(/^import "jsr:[^"]*";\s*$/m, "");   // Deno-only type import
const js = transformSync(src, { loader: "ts", target: "es2022", format: "esm" }).code;

/* Load the module once per scenario with its own stubs. */
async function runHandler({ body, tavily }) {
  let handler;
  const calls = [];
  globalThis.Deno = { env: { get: (k) => (k === "TAVILY_API_KEY" ? "tvly-testkey000" : undefined) },
                      serve: (h) => { handler = h; } };
  globalThis.fetch = async (url, init) => {
    const sent = JSON.parse(init.body);
    calls.push(sent);
    return tavily(sent);
  };
  const mod = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  await import(mod + `#${Math.random()}`);
  const res = await handler(new Request("https://x/functions/v1/product-search", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { res, data: await res.json(), calls };
}

const listing = (domain, i) => ({
  url: `https://www.${domain}/itm/${domain.split(".")[0]}-${i}`,
  title: `${domain.split(".")[0]} listing ${i} $${10 + i}`,
  content: `a thing for sale $${10 + i}`,
});
const okReply = (sent) => new Response(JSON.stringify({
  results: Array.from({ length: sent.max_results }, (_, i) => listing(sent.include_domains[0], i)),
  images: [],
}), { status: 200, headers: { "Content-Type": "application/json" } });

// ── 1. one search per marketplace ───────────────────────────────────────
{
  console.log("\n1. Every marketplace gets its own search");
  const { data, calls } = await runHandler({ body: { query: "jordan 4", maxResults: 24 }, tavily: okReply });
  ok("five searches, not one", calls.length === 5, String(calls.length));
  const domains = calls.map((c) => c.include_domains.join(","));
  ok("one domain each", calls.every((c) => c.include_domains.length === 1), JSON.stringify(domains));
  ok("covers all five online boards",
     new Set(domains).size === 5 && domains.includes("ebay.com") && domains.includes("depop.com"),
     JSON.stringify(domains));
  ok("all five appear in the answer", data.markets.length === 5, JSON.stringify(data.markets));
  ok("returns a useful number of listings", data.count >= 20, String(data.count));
}

// ── 2. the results are dealt out, not stacked ───────────────────────────
{
  console.log("\n2. The first screenful shows every marketplace");
  const { data } = await runHandler({ body: { query: "jordan 4", maxResults: 24 }, tavily: okReply });
  const firstFive = data.results.slice(0, 5).map((r) => r.market);
  ok("the first five are five different boards", new Set(firstFive).size === 5, JSON.stringify(firstFive));
}

// ── 3. a filter still narrows it ────────────────────────────────────────
{
  console.log("\n3. A marketplace filter still means what it says");
  const { data, calls } = await runHandler({
    body: { query: "jordan 4", marketplaces: ["ebay"], maxResults: 24 }, tavily: okReply });
  ok("one search, for eBay only", calls.length === 1 && calls[0].include_domains[0] === "ebay.com",
     JSON.stringify(calls.map((c) => c.include_domains)));
  ok("only eBay comes back", data.markets.length === 1 && data.markets[0] === "eBay", JSON.stringify(data.markets));
  ok("and a single board still fills the page", data.count >= 8, String(data.count));
}

// ── 4. one board failing does not sink the search ───────────────────────
{
  console.log("\n4. One marketplace failing does not lose the others");
  const { res, data } = await runHandler({
    body: { query: "jordan 4", maxResults: 24 },
    tavily: (sent) => sent.include_domains[0] === "vinted.com"
      ? new Response("upstream boom", { status: 500 })
      : okReply(sent),
  });
  ok("still a 200", res.status === 200, String(res.status));
  ok("the other four are returned", data.markets.length === 4, JSON.stringify(data.markets));
  ok("and Vinted is simply absent", !data.markets.includes("Vinted"));
}

// ── 5. everything failing is still reported ─────────────────────────────
{
  console.log("\n5. A bad key is still reported, not swallowed");
  const { res, data } = await runHandler({
    body: { query: "jordan 4", maxResults: 24 },
    tavily: () => new Response("unauthorized", { status: 401 }),
  });
  ok("502 with the reason", res.status === 502 && /401/.test(data.error), JSON.stringify(data.error));
}

// ── 6. duplicates across boards are dropped once ────────────────────────
{
  console.log("\n6. The same listing twice is kept once");
  const dupe = { url: "https://www.ebay.com/itm/same", title: "same thing", content: "" };
  const { data } = await runHandler({
    body: { query: "x", maxResults: 24 },
    tavily: (sent) => new Response(JSON.stringify({ results: [dupe, dupe, listing(sent.include_domains[0], 9)], images: [] }),
      { status: 200 }),
  });
  const urls = data.results.map((r) => r.url);
  ok("no url appears twice", new Set(urls).size === urls.length, JSON.stringify(urls));
}

// ── 7. sale dates are read, never invented ─────────────────────────────
{
  console.log("\n7. Sale dates come off the listings themselves");
  const y = new Date().getUTCFullYear();
  const dated = (sent) => new Response(JSON.stringify({ results: [
    { url: `https://www.${sent.include_domains[0]}/itm/a`, title: "Nice thing", content: `Sold Mar 3, ${y - 1}` },
    { url: `https://www.${sent.include_domains[0]}/itm/b`, title: `Thing (Sold Feb 14, ${y - 1})`, content: "" },
    { url: `https://www.${sent.include_domains[0]}/itm/c`, title: "Thing", content: `Sold 14 Feb ${y - 1}` },
    { url: `https://www.${sent.include_domains[0]}/itm/d`, title: "Thing", content: "no date here at all" },
  ], images: [] }), { status: 200 });

  const { data } = await runHandler({ body: { query: "x", sold: true, maxResults: 40 }, tavily: dated });
  ok("dates were found", data.soldDates.length > 0, JSON.stringify(data.soldDates));
  ok("every one is an ISO day", data.soldDates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
     JSON.stringify(data.soldDates));
  ok("both orderings parse",
     data.soldDates.includes(`${y - 1}-03-03`) && data.soldDates.includes(`${y - 1}-02-14`),
     JSON.stringify(data.soldDates));
  ok("they come back sorted",
     JSON.stringify(data.soldDates) === JSON.stringify([...data.soldDates].sort()),
     JSON.stringify(data.soldDates));
  ok("datedCount matches", data.datedCount === data.soldDates.length,
     `${data.datedCount} vs ${data.soldDates.length}`);
  ok("undated listings add nothing", data.datedCount < data.count, `${data.datedCount} of ${data.count}`);
  ok("the breakdown by marketplace adds up to the total",
     Object.values(data.datesByMarket).flat().length === data.datedCount,
     JSON.stringify(data.datesByMarket));
  ok("the working text never ships", data.results.every((r) => r._text === undefined));
  ok("and no listing text leaked a price",
     data.results.every((r) => !/\$\d/.test(JSON.stringify(r))), JSON.stringify(data.results[0]));
}

// ── 8. a listing with no date contributes nothing ──────────────────────
{
  console.log("\n8. No date, no point on the chart");
  const { data } = await runHandler({ body: { query: "x", sold: true, maxResults: 24 }, tavily: okReply });
  ok("plenty of listings", data.count > 5, String(data.count));
  ok("but zero dates, not zero-filled ones", data.datedCount === 0 && data.soldDates.length === 0,
     JSON.stringify(data.soldDates));
}

// ── 9. junk near the word "sold" is not turned into a date ─────────────
{
  console.log("\n9. Nonsense is dropped rather than guessed at");
  const junk = (sent) => new Response(JSON.stringify({ results: [
    { url: `https://www.${sent.include_domains[0]}/itm/a`, title: "Sold Feb 30, 2024", content: "" },
    { url: `https://www.${sent.include_domains[0]}/itm/b`, title: "Sold Smarch 4, 2024", content: "" },
    { url: `https://www.${sent.include_domains[0]}/itm/c`, title: "Sold Jan 99, 2024", content: "" },
    { url: `https://www.${sent.include_domains[0]}/itm/d`, title: "Sold Jan 1, 1899", content: "" },
    { url: `https://www.${sent.include_domains[0]}/itm/e`, title: "Sold out", content: "" },
  ], images: [] }), { status: 200 });
  const { data } = await runHandler({ body: { query: "x", sold: true, maxResults: 24 }, tavily: junk });
  ok("not one of them became a date", data.datedCount === 0, JSON.stringify(data.soldDates));
}

// ── 10. a bare month and day means the most recent one ─────────────────
{
  console.log("\n10. A year-less date means the one that already happened");
  const now = new Date();
  const recent = new Date(now.getTime() - 20 * 864e5);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const label = `${MON[recent.getUTCMonth()]} ${recent.getUTCDate()}`;
  const bare = (sent) => new Response(JSON.stringify({ results: [
    { url: `https://www.${sent.include_domains[0]}/itm/a`, title: `Thing Sold ${label}`, content: "" },
  ], images: [] }), { status: 200 });
  const { data } = await runHandler({
    body: { query: "x", sold: true, marketplaces: ["ebay"], maxResults: 24 }, tavily: bare });
  ok("it resolved to a date", data.soldDates.length === 1, JSON.stringify(data.soldDates));
  ok("in the past, not the future", data.soldDates.every((d) => new Date(d + "T00:00:00Z") <= now),
     JSON.stringify(data.soldDates));
  ok("and it is the recent one, not last year's",
     data.soldDates[0] === recent.toISOString().slice(0, 10),
     `${data.soldDates[0]} vs ${recent.toISOString().slice(0, 10)}`);
}

// ── 11. a completed-listings page yields every sale on it ──────────────
{
  console.log("\n11. One page, many sales — all of them counted");
  const y = new Date().getUTCFullYear();
  /* What a marketplace's sold-items page actually looks like: one result,
     a long page, a sale date beside every item on it. Reading only the
     first was why the chart had nothing to draw. */
  const page = Array.from({ length: 14 }, (_, i) =>
    `Item ${i} Sold Jul ${i + 1}, ${y - 1}`).join(" \u00b7 ");
  const many = (sent) => new Response(JSON.stringify({ results: [
    { url: `https://www.${sent.include_domains[0]}/sch/i.html`, title: "Sold items",
      content: "Sold items page", raw_content: page },
  ], images: [] }), { status: 200 });

  const { data, calls } = await runHandler({
    body: { query: "x", sold: true, marketplaces: ["ebay"], maxResults: 24 }, tavily: many });
  ok("the whole page was asked for", calls[0].include_raw_content === true, JSON.stringify(calls[0].include_raw_content));
  ok("all fourteen sales were read, not just the first", data.datedCount === 14, String(data.datedCount));
  ok("from a single listing", data.count === 1, String(data.count));
  ok("all attributed to the right marketplace",
     data.datesByMarket.eBay?.length === 14, JSON.stringify(Object.keys(data.datesByMarket)));
  ok("and the page text still never ships",
     !JSON.stringify(data.results).includes("raw_content") && data.results.every((r) => r._text === undefined));
}

// ── 12. the active pass does not pay for page text it never reads ──────
{
  console.log("\n12. Only the sold pass pulls full pages");
  const { calls } = await runHandler({ body: { query: "x", maxResults: 24 }, tavily: okReply });
  ok("the active pass leaves it off", calls.every((c) => c.include_raw_content === false),
     JSON.stringify(calls.map((c) => c.include_raw_content)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
