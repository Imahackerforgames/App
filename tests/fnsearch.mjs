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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
