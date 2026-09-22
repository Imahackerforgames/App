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

/* A token shaped like the one the gateway hands this function. Only the
   subject claim is read — the signature is never checked here, because by
   the time the function runs the gateway has already verified it. */
const TOKEN = (sub) =>
  `x.${Buffer.from(JSON.stringify({ sub })).toString("base64")}.y`;

/* Load the module once per scenario with its own stubs. */
async function runHandler({ body, tavily, extract = null, rateLimitAllows = true,
                            rateLimitBroken = false, pro = true, signedIn = true,
                            rateLimitRow = null, onConsume = null }) {
  let handler;
  const calls = [];
  const rpcCalls = [];
  const ENV = { TAVILY_API_KEY: "tvly-testkey000",
                SUPABASE_URL: "https://stub.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-stub" };
  globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
  globalThis.fetch = async (url, init) => {
    /* The entitlement lookup is a GET with no body, so it has to be handled
       before anything tries to parse one. */
    if (String(url).includes("/rest/v1/rate_limits")) {
      return new Response(JSON.stringify(rateLimitRow ? [rateLimitRow] : []),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(url).includes("/rest/v1/entitlements")) {
      return new Response(JSON.stringify(pro ? [{ plan: "pro", expires_at: null }] : []),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const sent = JSON.parse(init.body);
    if (String(url).includes("/rpc/consume_rate_limit")) {
      rpcCalls.push(sent);
      onConsume?.(sent);
      if (rateLimitBroken) return new Response("limiter exploded", { status: 500 });
      return new Response(JSON.stringify(rateLimitAllows), { status: 200 });
    }
    sent._endpoint = String(url).includes("/extract") ? "extract" : "search";
    calls.push(sent);
    if (sent._endpoint === "extract") {
      return extract ? extract(sent)
        : new Response(JSON.stringify({ results: [], failed_results: [] }), { status: 200 });
    }
    return tavily(sent);
  };
  const mod = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  await import(mod + `#${Math.random()}`);
  const res = await handler(new Request("https://x/functions/v1/product-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signedIn ? { Authorization: `Bearer ${TOKEN("u-test")}` } : {}),
    },
    body: JSON.stringify(body),
  }));
  return { res, data: await res.json(), rpcCalls,
           calls: calls.filter((c) => c._endpoint === "search"),
           extracts: calls.filter((c) => c._endpoint === "extract") };
}

/* Each marketplace gives listings their own URL shape, and the function
   now keeps only URLs with that shape — so a fixture that put /itm/ on
   every domain would be testing a world that does not exist, and only the
   eBay rows would survive. */
const LISTING_PATH = {
  "ebay.com": "itm",
  "mercari.com": "item",
  "poshmark.com": "listing",
  "depop.com": "products",
  "vinted.com": "items",
  "offerup.com": "item/detail",
  "facebook.com/marketplace": "marketplace/item",
};
const listingUrl = (domain, id) => {
  const host = domain.split("/")[0];
  return `https://www.${host}/${LISTING_PATH[domain] ?? "itm"}/${id}`;
};

const listing = (domain, i) => ({
  url: listingUrl(domain, `${domain.split(".")[0]}-${i}`),
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
    { url: listingUrl(sent.include_domains[0], "a"), title: "Nice thing", content: `Sold Mar 3, ${y - 1}` },
    { url: listingUrl(sent.include_domains[0], "b"), title: `Thing (Sold Feb 14, ${y - 1})`, content: "" },
    { url: listingUrl(sent.include_domains[0], "c"), title: "Thing", content: `Sold 14 Feb ${y - 1}` },
    { url: listingUrl(sent.include_domains[0], "d"), title: "Thing", content: "no date here at all" },
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
    { url: listingUrl(sent.include_domains[0], "a"), title: "Sold Feb 30, 2024", content: "" },
    { url: listingUrl(sent.include_domains[0], "b"), title: "Sold Smarch 4, 2024", content: "" },
    { url: listingUrl(sent.include_domains[0], "c"), title: "Sold Jan 99, 2024", content: "" },
    { url: listingUrl(sent.include_domains[0], "d"), title: "Sold Jan 1, 1899", content: "" },
    { url: listingUrl(sent.include_domains[0], "e"), title: "Sold out", content: "" },
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
    { url: listingUrl(sent.include_domains[0], "a"), title: `Thing Sold ${label}`, content: "" },
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
  /* The page itself is never shown. It is a search-results page, not
     something you can buy, so the display filter drops it — while its
     fourteen dates are still counted above. That split is the point: what
     is shown and what is read are different questions. */
  ok("but the page itself is not shown as a product", data.count === 0, String(data.count));
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

// ── 13. the completed-items page is fetched, and read ──────────────────
{
  console.log("\n13. The sold pass goes and gets eBay's completed-items page");
  const y = new Date().getUTCFullYear();
  /* What that page is: a row per sale, each with its own date. An individual
     listing page mostly does not carry one, which is why reading only the
     search results found nothing to plot. */
  const soldPage = Array.from({ length: 22 }, (_, i) =>
    `Nice Thing ${i} Sold  Aug ${i + 1}, ${y - 1}`).join("\n");

  const { data, extracts } = await runHandler({
    body: { query: "jordan 4", sold: true, marketplaces: ["ebay"], maxResults: 24 },
    tavily: okReply,
    extract: (sent) => new Response(JSON.stringify({
      results: [{ url: sent.urls[0], raw_content: soldPage }], failed_results: [],
    }), { status: 200 }),
  });

  ok("it asked for exactly one page", extracts.length === 1 && extracts[0].urls.length === 1,
     JSON.stringify(extracts.map((e) => e.urls)));
  ok("the completed-items page, not the ordinary search",
     /LH_Sold=1/.test(extracts[0].urls[0]) && /LH_Complete=1/.test(extracts[0].urls[0]),
     extracts[0].urls[0]);
  ok("the query is in it", /jordan%204|jordan\+4/i.test(extracts[0].urls[0]), extracts[0].urls[0]);
  ok("and every dated row was read", data.datedCount === 22, String(data.datedCount));
  ok("attributed to eBay", data.datesByMarket.eBay?.length === 22, JSON.stringify(Object.keys(data.datesByMarket)));
  ok("still sorted", JSON.stringify(data.soldDates) === JSON.stringify([...data.soldDates].sort()));
  ok("and the page text never ships", !JSON.stringify(data).includes("Nice Thing"));
}

// ── 14. the extra fetch is only for the sold pass ──────────────────────
{
  console.log("\n14. The active pass doesn't fetch sold pages");
  const { extracts } = await runHandler({ body: { query: "x", maxResults: 24 }, tavily: okReply });
  ok("no extract call at all", extracts.length === 0, String(extracts.length));
}

// ── 15. a blocked page loses the chart, not the search ─────────────────
{
  console.log("\n15. If the page can't be read, the rest still works");
  const { res, data } = await runHandler({
    body: { query: "x", sold: true, marketplaces: ["ebay"], maxResults: 24 },
    tavily: okReply,
    extract: () => new Response("forbidden", { status: 403 }),
  });
  ok("still a 200", res.status === 200, String(res.status));
  ok("listings still counted", data.count > 0, String(data.count));
  ok("just no dates, rather than invented ones", data.datedCount === 0, JSON.stringify(data.soldDates));
}

// ── 16. Mercari and Poshmark are not guessed at ────────────────────────
{
  console.log("\n16. Only marketplaces with a readable page are fetched");
  const { extracts } = await runHandler({
    body: { query: "x", sold: true, maxResults: 24 }, tavily: okReply,
    extract: (sent) => new Response(JSON.stringify({ results: [], failed_results: [] }), { status: 200 }),
  });
  const urls = extracts.flatMap((e) => e.urls);
  ok("eBay only, though three marketplaces were searched",
     urls.length === 1 && /ebay\.com/.test(urls[0]), JSON.stringify(urls));
  ok("no credits spent guessing at Mercari or Poshmark",
     !urls.some((u) => /mercari|poshmark/.test(u)), JSON.stringify(urls));
}

// ── 17. one account cannot drain the Tavily balance ────────────────────
{
  console.log("\n17. Searches are capped per account");
  const { res, data, calls, rpcCalls } = await runHandler({
    body: { query: "x", maxResults: 24 }, tavily: okReply, rateLimitAllows: false,
    /* A refusal means the counter is at the cap, so the row has to say so
       too — otherwise the fixture describes a state that cannot happen. */
    rateLimitRow: { count: 35, window_start: new Date().toISOString() } });
  ok("refused with 429", res.status === 429, String(res.status));
  ok("and says why in words", /used all your searches/i.test(data.error || ""), JSON.stringify(data.error));
  /* The refusal carries the balance too, so the app can say when it lifts
     rather than leaving the person to guess. */
  ok("and carries the balance", data.quota?.remaining === 0, JSON.stringify(data.quota));
  ok("not one Tavily credit was spent", calls.length === 0, String(calls.length));
  ok("the limit was checked once", rpcCalls.length === 1, String(rpcCalls.length));
  ok("bucketed per account, not globally", /^search:/.test(rpcCalls[0]?.p_bucket || ""), rpcCalls[0]?.p_bucket);
}

// ── 18. a broken limiter must not lock everyone out ────────────────────
{
  console.log("\n18. If the limiter itself fails, searching still works");
  /* The RPC answering with a server error rather than a verdict. Failing
     closed here would mean a database hiccup takes the whole product down,
     which is worse than the spending a limiter prevents. */
  const { res, data, calls, rpcCalls } = await runHandler({
    body: { query: "x", maxResults: 24 }, tavily: okReply, rateLimitBroken: true });
  ok("the limiter was asked", rpcCalls.length === 1, String(rpcCalls.length));
  ok("still a 200 rather than a lockout", res.status === 200, String(res.status));
  ok("the search actually ran", calls.length > 0, String(calls.length));
  ok("and results came back", data.count > 0, String(data.count));
}

/* ── the premium gate ───────────────────────────────────────────────────
   Product Search is premium, and the interface saying so is not enough:
   the endpoint is reachable with any signed-in token. These check the
   server refuses, and — the part that matters for the bill — that it
   refuses before spending a Tavily credit. */
console.log("\nPremium is enforced by the server, not just the interface");
{
  const { res, data, calls } = await runHandler({
    body: { query: "airpods" }, tavily: okReply, pro: false,
  });
  ok("a free account is refused", res.status === 402, String(res.status));
  ok("and told why", /premium/i.test(String(data.error)), JSON.stringify(data.error));
  ok("no Tavily credit was spent", calls.length === 0, String(calls.length));
}
{
  const { res, calls } = await runHandler({
    body: { query: "airpods" }, tavily: okReply, signedIn: false,
  });
  ok("a caller with no token is refused", res.status === 402, String(res.status));
  ok("and spends nothing either", calls.length === 0, String(calls.length));
}
{
  const { res, calls } = await runHandler({
    body: { query: "airpods" }, tavily: okReply, pro: true,
  });
  ok("a premium account still gets through", res.status === 200, String(res.status));
  ok("and the search actually runs", calls.length > 0, String(calls.length));
}

/* ── only things you can actually buy ───────────────────────────────────
   Restricting by domain let through everything else a marketplace hosts.
   The five below are the real results from a live search that prompted
   this: a forum thread, two brand landing pages, an editorial post and a
   seller's shopfront. Every one on the right domain. None of them a
   product. */
console.log("\nNon-listing pages are discarded");
{
  const junk = [
    ["https://community.ebay.com/t5/Selling/Selling-a-Pre-Owned-HandBag/td-p/33", "Selling a Pre Owned HandBag on EBay? Think twice | Selling | eBay Community"],
    ["https://poshmark.com/brand/Merona", "Merona Products for Sale up to 90% Off Retail - Poshmark"],
    ["https://poshmark.com/brand/Italy", "Italy Products for Sale up to 90% Off Retail - Poshmark"],
    ["https://www.vinted.com/blog/luxury-trend-update", "Luxury Trend Update by Vinted"],
    ["https://poshmark.com/closet/kailynlowry", "Kail's Closet (@kailynlowry) - Poshmark"],
  ];
  const real = [
    ["https://www.ebay.com/itm/226012345678", "Coach Willow Tote Pebbled Leather Handbag | eBay"],
    ["https://poshmark.com/listing/Coach-Willow-Tote-68f0a1", "Coach Willow Tote - Poshmark"],
    ["https://www.mercari.com/us/item/m88776655/", "Coach Willow Tote Brown | Mercari"],
    ["https://www.depop.com/products/seller-coach-willow-tote/", "Coach Willow Tote - Depop"],
    ["https://www.vinted.com/items/4455667-coach-willow-tote", "Coach Willow Tote | Vinted"],
  ];
  const all = [...junk, ...real];
  const { data } = await runHandler({
    body: { query: "coach willow tote", maxResults: 20 },
    tavily: (sent) => {
      const host = sent.include_domains[0].split("/")[0].split(".")[0];
      const mine = all.filter(([u]) => u.includes(host));
      return new Response(JSON.stringify({
        results: mine.map(([url, title]) => ({ url, title, content: "listing text" })),
        images: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const urls = data.results.map((r) => r.url);
  for (const [url, title] of junk) {
    ok(`drops ${title.slice(0, 34)}…`, !urls.includes(url), url);
  }
  ok("keeps every real listing", real.every(([u]) => urls.includes(u)),
     JSON.stringify(urls));
  ok("and nothing else got through", data.results.length === real.length,
     String(data.results.length));
}

console.log("\nTitles lose the marketplace's own name");
{
  const { data } = await runHandler({
    body: { query: "coach willow tote" },
    tavily: (sent) => {
      const d = sent.include_domains[0];
      const rows = {
        "ebay.com": ["https://www.ebay.com/itm/1", "Coach Willow Tote Brown for sale online | eBay"],
        "poshmark.com": ["https://poshmark.com/listing/x-1", "Coach Willow Tote - Poshmark | Poshmark"],
        "depop.com": ["https://www.depop.com/products/s-x/", "Coach Willow Tote \u00b7 Depop"],
      }[d];
      return new Response(JSON.stringify({
        results: rows ? [{ url: rows[0], title: rows[1], content: "x" }] : [], images: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const titles = data.results.map((r) => r.title);
  ok("no marketplace suffix survives",
     titles.every((t) => !/ebay|poshmark|depop/i.test(t)), JSON.stringify(titles));
  ok("and the product name is intact",
     titles.every((t) => /^Coach Willow Tote/.test(t)), JSON.stringify(titles));
  ok("the doubled suffix goes too",
     titles.includes("Coach Willow Tote"), JSON.stringify(titles));
}

console.log("\nEvery result carries a direct link");
{
  const { data } = await runHandler({ body: { query: "airpods" }, tavily: (sent) =>
    new Response(JSON.stringify({ results: [{
      url: `https://www.${sent.include_domains[0]}/itm/1`.replace("poshmark.com/itm", "poshmark.com/listing")
        .replace("mercari.com/itm", "mercari.com/item").replace("depop.com/itm", "depop.com/products")
        .replace("vinted.com/itm", "vinted.com/items"),
      title: "AirPods Pro", content: "x" }], images: [] }), { status: 200 }) });
  ok("a url on every row", data.results.length > 0 && data.results.every((r) => /^https:\/\//.test(r.url)),
     JSON.stringify(data.results.map((r) => r.url)));
}

/* ── the visible allowance ──────────────────────────────────────────────
   A limit nobody can see is indistinguishable from the app being broken.
   The two things that must hold: asking what is left must not spend one,
   and the number must be the real one rather than something invented. */
console.log("\nThe search allowance can be read without spending it");
{
  let consumed = 0;
  const { res, data, calls } = await runHandler({
    body: { peek: true },
    tavily: okReply,
    rateLimitRow: { count: 9, window_start: new Date(Date.now() - 10 * 60_000).toISOString() },
    onConsume: () => { consumed++; },
  });
  ok("a peek answers 200", res.status === 200, String(res.status));
  ok("the limit is the real one", data.quota.limit === 35, JSON.stringify(data.quota));
  ok("used comes from the counter", data.quota.used === 9, String(data.quota?.used));
  ok("and remaining is the difference", data.quota.remaining === 26, String(data.quota?.remaining));
  ok("peeking spends nothing", consumed === 0, String(consumed));
  ok("and runs no search", calls.length === 0, String(calls.length));
  ok("it says when it resets", typeof data.quota.resetsAt === "string", JSON.stringify(data.quota.resetsAt));
}
{
  /* A window that lapsed is a full allowance again, not a reset time in
     the past — which is what a naive read of the row would report. */
  const { data } = await runHandler({
    body: { peek: true }, tavily: okReply,
    rateLimitRow: { count: 15, window_start: new Date(Date.now() - 3 * 60 * 60_000).toISOString() },
  });
  ok("a lapsed window reads as untouched", data.quota.used === 0 && data.quota.remaining === 35,
     JSON.stringify(data.quota));
  ok("with no reset pending", data.quota.resetsAt === null, JSON.stringify(data.quota.resetsAt));
}
{
  const { data } = await runHandler({ body: { peek: true }, tavily: okReply, pro: false });
  ok("a free account is refused a peek too", /premium/i.test(String(data.error)), JSON.stringify(data.error));
}
{
  const { data } = await runHandler({
    body: { query: "airpods" }, tavily: okReply,
    rateLimitRow: { count: 4, window_start: new Date().toISOString() },
  });
  ok("a real search reports the balance back", data.quota?.remaining === 31,
     JSON.stringify(data.quota));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
