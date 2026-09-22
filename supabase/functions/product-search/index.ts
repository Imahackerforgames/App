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

/* What an individual product listing's URL looks like, per marketplace.

   Restricting by domain was never enough. A marketplace's domain also
   carries its forums, its brand landing pages, its editorial posts and its
   sellers' shopfronts, and search ranks those highly because they are
   popular pages — so a search for a handbag came back with an eBay
   Community thread, two Poshmark brand pages, a Vinted trend article and
   somebody's closet. All on the right domains. None of them a thing you can
   buy.

   Every one of these marketplaces gives individual listings their own URL
   shape, and that shape is the only reliable way to tell a product from a
   page about products. Titles cannot do it: "Merona Products for Sale up to
   90% Off Retail" reads like a listing and is a category page.

   A marketplace missing from this map has no results kept at all, which is
   deliberate — silently falling back to "anything on the domain" is how the
   original bug behaves. */
const LISTING_PATH: Record<string, RegExp> = {
  eBay: /\/itm\//i,
  Mercari: /\/item\//i,
  Poshmark: /\/listing\//i,
  Depop: /\/products\//i,
  Vinted: /\/items\//i,
  OfferUp: /\/item\/detail\//i,
  Marketplace: /\/marketplace\/item\//i,
};
const isListing = (market: string, url: string) =>
  !!LISTING_PATH[market]?.test(String(url || ""));

/* The completed-items page per marketplace, which is where sale dates are
   actually written down — one per row. Fetched directly on a sold pass.
   Only marketplaces that render that page as text belong here. */
const SOLD_PAGE: Record<string, (q: string) => string> = {
  "ebay.com": (q) =>
    `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`,
};

/* How many searches one account gets per hour.

   Each analysis is two calls to this function, and each call fans out to one
   Tavily search per marketplace plus a page extract — so a single analysis
   can be a dozen Tavily requests. Thirty-five calls an hour is therefore
   around seventeen analyses, which is a working afternoon rather than a
   wall, while still bounding the Tavily bill.

   Counted in Postgres, not in memory: Edge Functions run on many instances
   and an in-process counter is bypassed by landing on a different one. */
const SEARCH_MAX = 35, SEARCH_WINDOW = 60 * 60;

/* What is left, without spending any of it.

   A limit nobody can see is indistinguishable from the app being broken:
   you press search, nothing happens, and there is no way to learn why. So
   the count is readable, and the app shows it.

   Read straight from the table rather than through consume_rate_limit,
   because that function's whole job is to increment — looking at your own
   remaining balance must not cost you one of them. The window is fixed, so
   a row older than the window has already lapsed and reads as zero used. */
type Quota = { limit: number; used: number; remaining: number; resetsAt: string | null };
async function quotaFor(bucket: string, max: number, windowSeconds: number): Promise<Quota | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/rate_limits?select=count,window_start&bucket=eq.${encodeURIComponent(bucket)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;

    const startedAt = row?.window_start ? new Date(row.window_start).getTime() : 0;
    const endsAt = startedAt + windowSeconds * 1000;
    /* A lapsed window is a fresh allowance, so it reads as nothing used and
       no reset pending — not as a reset time in the past. */
    const live = !!row && endsAt > Date.now();
    const used = live ? Number(row.count) || 0 : 0;
    return {
      limit: max,
      used: Math.min(used, max),
      remaining: Math.max(0, max - used),
      resetsAt: live ? new Date(endsAt).toISOString() : null,
    };
  } catch (e) {
    console.error("product-search: quota read failed:", String(e));
    return null;
  }
}

/* Fails open. A limiter that stops everyone working when the database is
   unreachable is worse than the spending it prevents. */
async function allow(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) {
      console.error("rate limit check failed:", res.status, (await res.text()).slice(0, 200));
      return true;
    }
    return (await res.json()) !== false;
  } catch (e) {
    console.error("rate limit check threw:", String(e));
    return true;
  }
}

/* Who is asking. verify_jwt is on, so a token is always present and already
   verified by the gateway before this runs — reading the subject claim here
   is for bucketing, not for trusting. Unparseable falls back to the address
   so the limit still applies to something. */
function callerId(req: Request): string {
  try {
    const raw = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    const claims = JSON.parse(atob(raw.split(".")[1]));
    if (claims?.sub) return `user:${claims.sub}`;
  } catch {}
  return `ip:${(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"}`;
}

/* Whether this account has paid. Product Search is premium, but until now
   only the interface said so — the server took anyone with a valid token.
   Hiding a button is not enforcing it: a free account could call this
   endpoint directly and spend search credits fifteen times an hour.

   Every failure answers false, exactly as in ai-assistant. The entitlements
   table is read with the service role because the browser cannot read
   anyone's row but its own, and the only way through is a live row that
   says pro. */
async function callerIsPro(req: Request): Promise<boolean> {
  try {
    const id = callerId(req);
    if (!id.startsWith("user:")) return false;
    const userId = id.slice(5);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("product-search: cannot check entitlement, SUPABASE_URL or service role key missing.");
      return false;
    }
    const res = await fetch(
      `${url}/rest/v1/entitlements?select=plan,expires_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.plan !== "pro") return false;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
    return true;
  } catch (e) {
    console.error("product-search: entitlement check failed:", String(e));
    return false;
  }
}

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

/* Marketplaces append their own name to every page title — "… | eBay",
   "… - Poshmark". On a card that already says which marketplace the listing
   is on, that is noise taking up the line. Stripped in a small loop because
   a few arrive with it twice ("… - Poshmark | Poshmark"). */
const MARKET_TAIL =
  /\s*[|\-\u2013\u2014\u00b7]\s*(?:ebay(?:\s+community)?|poshmark|mercari|depop|vinted|offerup|facebook(?:\s+marketplace)?)\s*$/i;
const cleanTitle = (t: string) => {
  let out = stripPrices(String(t || ""));
  for (let i = 0; i < 3 && MARKET_TAIL.test(out); i++) out = out.replace(MARKET_TAIL, "");
  return out
    .replace(/\s*\bfor sale online\b\s*$/i, "")
    .replace(/\s*[|\-\u2013\u2014\u00b7]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

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
      /* "How many do I have left?" — answered without spending one. The
         Settings screen asks this; nothing else does. */
      peek = false,
    } = await req.json();

    if (peek) {
      if (!(await callerIsPro(req))) {
        return json({ error: "Product Search is a premium feature. Upgrade in Settings to use it.", upgrade: true }, 402);
      }
      return json({ quota: await quotaFor(`search:${callerId(req)}`, SEARCH_MAX, SEARCH_WINDOW) });
    }

    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Missing 'query'." }, 400);
    }

    /* Premium first, then the rate limit — a free account must not be able
       to eat into the allowance, and neither check may cost a Tavily credit
       to fail. */
    if (!(await callerIsPro(req))) {
      return json({ error: "Product Search is a premium feature. Upgrade in Settings to use it.", upgrade: true }, 402);
    }

    /* Checked after the request is understood but before a single Tavily
       credit is spent. */
    if (!(await allow(`search:${callerId(req)}`, SEARCH_MAX, SEARCH_WINDOW))) {
      console.warn("product-search: rate limited.");
      return json({
        error: "You've used all your searches for this hour. They refresh shortly.",
        quota: await quotaFor(`search:${callerId(req)}`, SEARCH_MAX, SEARCH_WINDOW),
      }, 429);
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
    /* Ask for considerably more than we intend to show, because the listing
       filter now discards most of what search returns — category pages and
       articles outrank individual listings, so the first few hits are
       usually the ones being thrown away.

       This does not multiply the bill: Tavily charges per search request,
       not per result, so a request for twenty costs the same as one for
       five. Worth re-checking against their pricing page if that ever looks
       wrong, because the whole shape of this line depends on it. */
    const perDomain = Math.min(20, Math.max(10, Math.ceil(wanted / domains.length) * 3));

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
        title: cleanTitle(String(r.title)),
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

    /* Two different questions, so two different lists.

       What gets SHOWN must be individual listings — that is the whole point
       of the filter. But what gets READ FOR SALE DATES must not be, because
       a marketplace's completed-items page is the richest source of dates
       there is: one page, dozens of dated sales. Filtering before harvesting
       would have quietly gutted the sold chart to fix the results list.

       So dates come off everything on a marketplace domain, and only
       listings are dealt out below. */
    const listings = kept.filter((r: any) => isListing(r.market, r.url));

    /* Deal them out one marketplace at a time, so the first screenful shows
       every board that answered rather than everything from whichever one
       ranked best. Without this the merge would still be sorted by
       marketplace and the page would look exactly as lopsided as before. */
    const lanes = new Map<string, any[]>();
    for (const r of listings) {
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

    /* `kept`, not `results` — see above. A sold-items page carries more
       dates than every individual listing put together, and it is exactly
       the kind of page the display filter throws away. */
    for (const r of kept) addDates(r.market, readSoldDates(r._text));

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
    for (const r of kept) delete r._text;
    console.log(`product-search: ok — "${query}" (${mode}${sold ? ", sold" : ""}) over ${domains.length} marketplace(s) [${domains.join(", ")}], ${perDomain} each → ${hits.length} raw, ${listings.length} real listings, ${results.length} shown across ${markets.length} marketplaces. Discarded ${kept.length - listings.length} non-listing pages (still read for sale dates).`);

    return json({
      query,
      mode,
      sold,
      /* Sent back on every search so the counter moves as it is spent,
         rather than only when Settings is opened. */
      quota: await quotaFor(`search:${callerId(req)}`, SEARCH_MAX, SEARCH_WINDOW),
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
