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

const ONLINE_DOMAINS = [
  "ebay.com", "mercari.com", "vinted.com", "poshmark.com", "depop.com",
];
/* craigslist.org used to be here. It is not one of the seven marketplaces
   this product covers, and the app's own URL allowlist is built from that
   list — so every Craigslist result was fetched, counted against the
   quota, and then discarded before it could be shown. */
const LOCAL_DOMAINS = [
  "offerup.com", "facebook.com/marketplace",
];

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

    const { query, mode = "online", maxResults = 10 } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Missing 'query'." }, 400);
    }

    const domains = mode === "local" ? LOCAL_DOMAINS : ONLINE_DOMAINS;

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
        query: query.trim(),
        search_depth: "basic",
        include_domains: domains,
        max_results: Math.min(Number(maxResults) || 10, 20),
        include_images: true,
        include_answer: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`product-search: Tavily returned ${res.status}. Tavily said: ${detail.slice(0, 500)}`);
      if (res.status === 401 || res.status === 403) {
        console.error("product-search: Tavily rejected the credential. The key is reaching this function but Tavily does not accept it — regenerate it at tavily.com and re-save the secret, and check the Tavily account's email is verified.");
      }
      if (res.status === 429) {
        console.error("product-search: Tavily rate limit or monthly quota reached.");
      }
      return json({ error: `Tavily returned ${res.status}`, detail }, 502);
    }

    const data = await res.json();

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
    const results = (data.results ?? [])
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
        image: (data.images ?? []).find((i: any) =>
          typeof i === "string" ? false : i?.url
        )?.url ?? null,
      }))
      .filter((r: any) => r.market);

    console.log(`product-search: ok — "${query}" (${mode}) → ${results.length} of ${(data.results ?? []).length} raw results kept.`);

    return json({
      query,
      mode,
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
