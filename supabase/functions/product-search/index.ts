import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ═══════════════════════════════════════════════════════════════
   product-search — Tavily, server-side.

   The API key lives in Deno.env and never reaches the browser.
   verify_jwt is on, so only signed-in users can spend your credits.

   Results are restricted to resale marketplaces via include_domains,
   which is what keeps news/blogs/Reddit out of the results — filtering
   after the fact is unreliable, filtering at the source is not.

   ── Why this version exists ────────────────────────────────────
   The previous one failed silently: a missing key and a thrown error
   both returned 500 with nothing written to the log, so the only way
   to tell them apart was to read the response body in a browser. It
   now logs which branch it took, and on a Tavily rejection it logs
   what Tavily actually said.

   It also reports a fingerprint of the key — length, prefix, and
   whether it has stray whitespace — never the key itself. Whitespace
   from a copy-paste is the single most common cause of a 401 here and
   is invisible in the dashboard.
   ═══════════════════════════════════════════════════════════════ */

/* The seven marketplaces this product covers, keyed the way the app names
   them, so a marketplace filter can be passed straight through. */
const MARKET_DOMAIN: Record<string, string> = {
  ebay: "ebay.com",
  mercari: "mercari.com",
  vinted: "vinted.com",
  poshmark: "poshmark.com",
  depop: "depop.com",
  offerup: "offerup.com",
  facebook: "facebook.com/marketplace",
};
const ONLINE_DOMAINS = ["ebay.com", "mercari.com", "vinted.com", "poshmark.com", "depop.com"];
/* craigslist.org used to be here. It is not one of the seven marketplaces
   this product covers, and the app's own URL allowlist is built from that
   list — so every Craigslist result was fetched, counted against the
   quota, and then discarded before it could be shown. */
const LOCAL_DOMAINS = ["offerup.com", "facebook.com/marketplace"];

/* Only marketplaces that publish completed listings can answer "did this
   sell", so a sold pass is restricted to these however the filter is set. */
const SOLD_CAPABLE = new Set(["ebay.com", "mercari.com", "poshmark.com"]);

/* The completed-items page per marketplace, which is where sale dates are
   actually written down — one per row. Fetched directly on a sold pass.
   Only marketplaces that render that page as text belong here. */
const SOLD_PAGE: Record<string, (q: string) => string> = {
  "ebay.com": (q) =>
    `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* Strip any dollar figure out of returned text. The app must never show a
   purchase price the user didn't enter themselves — defense in depth, so a
   scraped snippet can't smuggle one through. */
const stripPrices = (t: string) =>
  (t || "").replace(/\$\s?[\d,]+(\.\d{1,2})?/g, "").replace(/\s{2,}/g, " ").trim();

/* Describes the key without revealing it. Safe to log. */
function fingerprint(raw: string) {
  const trimmed = raw.trim();
  return {
    length: trimmed.length,
    prefix: trimmed.slice(0, 5),
    hasSurroundingWhitespace: raw !== trimmed,
    hasQuotes: /^["'].*["']$/.test(trimmed),
    looksLikeTavilyKey: trimmed.startsWith("tvly-"),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const raw = Deno.env.get("TAVILY_API_KEY");
    if (!raw) {
      console.error("product-search: TAVILY_API_KEY is not set in this project's Edge Function secrets.");
      return json({
        error: "TAVILY_API_KEY is not set.",
        fix: "Supabase dashboard → Edge Functions → Secrets → add TAVILY_API_KEY",
      }, 500);
    }

    /* Trimmed before use, so a key pasted with a stray space or newline
       works anyway rather than 401-ing with nothing to point at. */
    const key = raw.trim().replace(/^["']|["']$/g, "");
    const fp = fingerprint(raw);
    console.log("product-search: key fingerprint", JSON.stringify(fp));
    if (fp.hasSurroundingWhitespace || fp.hasQuotes) {
      console.warn("product-search: the stored secret had whitespace or quotes around it; using the cleaned value. Re-save it without them.");
    }
    if (!fp.looksLikeTavilyKey) {
      console.warn(`product-search: the stored secret does not start with "tvly-" (starts "${fp.prefix}"). This is probably not a Tavily key.`);
    }

    const {
      query,
      mode = "online",
      maxResults = 10,
      /* Which marketplaces to search. The app computes this from its filter
         chips and it used to be dropped on the floor here, so choosing
         "eBay" searched all five online boards exactly like "All". */
      marketplaces,
      /* When true, look for completed listings rather than active ones. The
         two passes together are what make an analysis possible: active
         listings measure competition, sold listings measure demand. */
      sold = false,
    } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Missing 'query'." }, 400);
    }

    const pool = mode === "local" ? LOCAL_DOMAINS : ONLINE_DOMAINS;
    let domains = Array.isArray(marketplaces) && marketplaces.length
      ? marketplaces.map((k: string) => MARKET_DOMAIN[k]).filter(Boolean)
      : pool;
    /* A filter naming only marketplaces outside this mode would leave
       nothing to search, which reads as "no results" rather than as a bad
       filter. Fall back to the whole pool instead. */
    if (!domains.length) domains = pool;
    if (sold) {
      const capable = domains.filter((d: string) => SOLD_CAPABLE.has(d));
      domains = capable.length ? capable : [...SOLD_CAPABLE];
    }

    /* Bias the query itself toward completed listings. The sold pages live
       on the same domains as the active ones, so the domain list cannot
       separate them — the wording is what does. */
    const searchQuery = sold ? `${query.trim()} sold completed listing` : query.trim();

    /* One search per marketplace, run in parallel, rather than one search
       across all of them at once.

       A single Tavily call with five include_domains comes back as one
       ranked list, and ranking concentrates: eBay outranks the others for
       very nearly every query. Ten results therefore arrived as eight eBay
       listings and two of everything else — and on a narrow query, ten eBay
       listings and nothing else at all. That is why "All" stopped looking
       like all, and why the totals got thin. Asking each marketplace its own
       question is what makes the filter mean what it says.

       The cost is one Tavily credit per marketplace per search instead of
       one per search. That is a real trade, and it is why perDomain is
       derived from what the caller actually asked for rather than being set
       as high as it will go. */
    const wanted = Math.min(Math.max(Number(maxResults) || 10, 5), 40);
    const perDomain = Math.max(3, Math.min(10, Math.ceil(wanted / domains.length) + 2));

    /* The sold pass asks for the whole page, not just the snippet.

       A marketplace's completed-listings page carries a sale date beside
       every item on it — that is the only real dated sales data this app can
       reach. Tavily's default `content` is a few hundred characters of that
       page, which usually holds one date or none, which is why the chart had
       nothing to draw. `include_raw_content` returns the page text, where the
       rest of the dates are.

       Only on the sold pass: the active pass measures competition and has no
       use for it, and raw content is by far the biggest thing in a Tavily
       response. */
    const askTavily = async (domain: string) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          /* Sent in the body as well as the header. Tavily has accepted the
             key both ways across API versions, and sending both removes an
             auth-format mismatch as a possible cause of a 401. */
          api_key: key,
          query: searchQuery,
          search_depth: "basic",
          include_domains: [domain],
          max_results: perDomain,
          include_images: true,
          include_answer: false,
          include_raw_content: sold,
        }),
      });
      if (!res.ok) {
        const err: any = new Error(`Tavily returned ${res.status}`);
        err.status = res.status;
        err.detail = await res.text();
        throw err;
      }
      return await res.json();
    };

    const settled = await Promise.allSettled(domains.map(askTavily));
    const failures = settled
      .filter((r) => r.status === "rejected")
      .map((r: any) => r.reason);

    /* Every marketplace failing is a fault worth reporting — a bad key, a
       spent quota, Tavily down. Some of them failing is not: four
       marketplaces' worth of listings is a better answer than an error. */
    if (failures.length === domains.length) {
      const first: any = failures[0] ?? {};
      const status = Number(first.status) || 502;
      const detail = String(first.detail ?? first.message ?? "");
      console.error(`product-search: all ${domains.length} marketplaces failed. Tavily said: ${detail.slice(0, 500)}`);
      if (status === 401 || status === 403) {
        console.error("product-search: Tavily rejected the credential. The key is reaching this function but Tavily does not accept it — regenerate it at tavily.com and re-save the secret, and check the Tavily account's email is verified.");
      }
      if (status === 429) {
        console.error("product-search: Tavily rate limit or monthly quota reached.");
      }
      return json({ error: `Tavily returned ${status}`, detail }, 502);
    }
    if (failures.length) {
      console.warn(`product-search: ${failures.length} of ${domains.length} marketplaces failed; returning the rest.`);
    }

    const hits: any[] = [];
    const images: any[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      const d: any = r.value;
      hits.push(...(d.results ?? []));
      images.push(...(d.images ?? []));
    }

    const marketOf = (url: string) => {
      const u = url.toLowerCase();
      if (u.includes("ebay.")) return "eBay";
      if (u.includes("mercari.")) return "Mercari";
      if (u.includes("vinted.")) return "Vinted";
      if (u.includes("poshmark.")) return "Poshmark";
      if (u.includes("depop.")) return "Depop";
      if (u.includes("offerup.")) return "OfferUp";
      if (u.includes("facebook.")) return "Marketplace";
      return "";
    };

    const seen = new Set<string>();
    const kept = hits
      .filter((r: any) => {
        if (!r?.url || !r?.title) return false;
        const k = r.url.split("?")[0];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((r: any) => ({
        title: stripPrices(String(r.title)),
        url: String(r.url),
        market: marketOf(String(r.url)),
        snippet: stripPrices(String(r.content ?? "")).slice(0, 180),
        /* The listing's own words, untrimmed and with prices intact, kept
           only long enough to read sale dates off. Deleted before this
           leaves the function — see below.

           Capped because raw page text runs to hundreds of kilobytes and the
           dates sit in the item cards near the top; scanning all of it would
           cost time for listings nobody asked about. */
        _text: `${r.title ?? ""} ${r.content ?? ""} ${String(r.raw_content ?? "").slice(0, 40000)}`,
        image: images.find((i: any) =>
          typeof i === "string" ? false : i?.url
        )?.url ?? null,
      }))
      .filter((r: any) => r.market);

    /* Deal them out one marketplace at a time, so the first screenful shows
       every board that answered rather than everything from whichever one
       ranked best. Without this the merge would still be sorted by
       marketplace and the page would look exactly as lopsided as before. */
    const lanes = new Map<string, any[]>();
    for (const r of kept) {
      if (!lanes.has(r.market)) lanes.set(r.market, []);
      lanes.get(r.market)!.push(r);
    }
    const results: any[] = [];
    let dealt = true;
    while (dealt && results.length < wanted) {
      dealt = false;
      for (const lane of lanes.values()) {
        const next = lane.shift();
        if (!next) continue;
        results.push(next);
        dealt = true;
        if (results.length >= wanted) break;
      }
    }

    const markets = [...new Set(results.map((r: any) => r.market))];

    /* How many of those listings came from each marketplace. The caller can
       already see which marketplaces answered; this says how much each one
       actually carried, which is the difference between "eBay and Depop have
       it" and "eBay has nine and Depop has one".

       Counted from the listings that survived filtering, so it is a count of
       things this search actually found — not an estimate, and not a claim
       about total sales on that marketplace. */
    const marketCounts: Record<string, number> = {};
    for (const r of results) marketCounts[r.market] = (marketCounts[r.market] ?? 0) + 1;

    /* When a listing says when it sold, keep the date.

       Completed listings usually carry it in their own text — "Sold Sep 12,
       2026" on eBay, "Sold 12 Sep" elsewhere — and that is a real date on a
       real sale, which is the only thing that can honestly be plotted over
       time. Nothing is inferred: text with no readable date simply
       contributes nothing here.

       A completed-listings page lists many past sales, so one result can
       legitimately yield many dates — which is why these are counted and
       grouped as sales, not as listings.

       Years are optional in these strings. A bare "Sep 12" means the most
       recent September 12th that has already happened, since a completed
       listing cannot have sold in the future. */
    const MONTHS: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    /* "Sold Sep 12, 2026" and "Sold 12 Sep 2026" are both common; the year
       is often missing from both. */
    const SOLD_DATE =
      /sold[^A-Za-z0-9]{0,12}(?:([A-Za-z]{3,9})\.?\s+(\d{1,2})|(\d{1,2})\s+([A-Za-z]{3,9})\.?)(?:,?\s*(\d{4}))?/gi;
    /* A completed-listings page carries one of these per item, so a single
       result legitimately yields many dates. Capped so a pathological page
       cannot dominate the whole chart. */
    const MAX_DATES_PER_PAGE = 80;
    const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    const now = Date.now();
    const readSoldDates = (text: string): string[] => {
      const out: string[] = [];
      for (const m of String(text || "").matchAll(SOLD_DATE)) {
        if (out.length >= MAX_DATES_PER_PAGE) break;
        const month = MONTHS[(m[1] || m[4] || "").slice(0, 3).toLowerCase()];
        if (month === undefined) continue;
        const day = Number(m[2] || m[3]);
        if (!day || day > DAYS_IN[month]) continue;

        let year = Number(m[5]);
        if (year) {
          /* A four-digit number next to a date is usually the year, but not
             always — drop anything outside the range a sale could fall in. */
          const thisYear = new Date().getUTCFullYear();
          if (year < 2000 || year > thisYear) continue;
        } else {
          year = new Date().getUTCFullYear();
          if (Date.UTC(year, month, day) > now) year -= 1;
        }

        const t = Date.UTC(year, month, day);
        /* Date.UTC rolls an impossible date forward (Feb 30 becomes Mar 2),
           so check the parts came back unchanged rather than trusting it. */
        const d = new Date(t);
        if (d.getUTCMonth() !== month || d.getUTCDate() !== day || t > now) continue;
        out.push(d.toISOString().slice(0, 10));
      }
      return out;
    };

    const soldDates: string[] = [];
    /* The same dates split by marketplace, so the caller can show a
       breakdown that adds up to the total instead of two numbers that look
       unrelated to each other. */
    const datesByMarket: Record<string, string[]> = {};
    const addDates = (market: string, dates: string[]) => {
      if (!market || !dates.length) return;
      soldDates.push(...dates);
      (datesByMarket[market] ??= []).push(...dates);
    };

    for (const r of results) addDates(r.market, readSoldDates(r._text));

    /* Then the page the dates actually live on.

       Searching for "sold" returns listing pages, and an individual listing
       page mostly does not say when it sold — which is why the two previous
       attempts at this came back with nothing to plot. A marketplace's
       completed-items page does say: one date per row, dozens of rows. So
       fetch that page directly instead of hoping search surfaces it. It is
       the same URL the app already links to from the card.

       Only eBay is listed. Mercari and Poshmark render their sold results in
       the browser, so there is no text on the page to read; guessing at their
       URLs would spend credits for nothing. */
    let pageChars = 0;
    if (sold) {
      const urls = domains.map((d) => SOLD_PAGE[d]?.(String(query).trim())).filter(Boolean);
      if (urls.length) {
        try {
          const ex = await fetch("https://api.tavily.com/extract", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key, urls }),
          });
          if (!ex.ok) {
            console.warn(`product-search: sold-page extract returned ${ex.status}; falling back to the listings alone.`);
          } else {
            const ed = await ex.json();
            for (const r of ed?.results ?? []) {
              const text = String(r?.raw_content ?? "");
              pageChars += text.length;
              const market = marketOf(String(r?.url ?? ""));
              const found = readSoldDates(text);
              /* Counts only — never the page text, which is full of prices
                 this app does not present as its own. */
              console.log(`product-search: sold page ${market || "?"} — ${text.length} chars, ${found.length} dates.`);
              addDates(market, found);
            }
            for (const f of ed?.failed_results ?? []) {
              console.warn(`product-search: sold page could not be read: ${String(f?.error ?? "unknown")}`);
            }
          }
        } catch (e) {
          console.warn(`product-search: sold-page extract threw: ${String(e)}`);
        }
      }
    }

    soldDates.sort();
    for (const k of Object.keys(datesByMarket)) datesByMarket[k].sort();
    if (sold) {
      console.log(`product-search: sold dates — ${soldDates.length} total from ${results.length} listings and ${pageChars} chars of sold pages.`);
    }

    /* The working text goes no further. It is unstripped listing copy — full
       of prices this app is careful not to present as its own — and the
       client has no use for it. */
    for (const r of results) delete r._text;
    console.log(`product-search: ok — "${query}" (${mode}${sold ? ", sold" : ""}) over ${domains.length} marketplace(s) [${domains.join(", ")}], ${perDomain} each → ${results.length} of ${hits.length} raw kept across ${markets.length} marketplaces.`);

    return json({
      query,
      mode,
      sold,
      searchedDomains: domains,
      markets,
      marketCounts,
      soldDates,
      datesByMarket,
      datedCount: soldDates.length,
      count: results.length,
      retrievedAt: new Date().toISOString(),
      source: "tavily",
      results,
    });
  } catch (e) {
    console.error("product-search: unhandled error:", String(e));
    return json({ error: "Search failed.", detail: String(e) }, 500);
  }
});
