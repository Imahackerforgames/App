import React, { useState, useEffect, useMemo, useRef, useId } from "react";
import { PRIVACY, TERMS, LEGAL_UPDATED, SUPPORT_EMAIL } from "./legal.jsx";
import {
 Home as HomeIcon, Compass, Layers, Briefcase, Settings as SettingsIcon,
 Sparkles, Search as SearchIcon, MapPin, Globe, ExternalLink, SlidersHorizontal,
 Plus, TrendingUp, TrendingDown, Package, Bell, Calculator as CalcIcon,
 Check, Send, ChevronRight, ChevronDown, X, Target, ShoppingBag, Wrench,
 Droplets, Footprints, Shirt, Watch, Gem, Minus, FileText, Bookmark,
} from "lucide-react";
import AIAssistant from "./components/AIAssistant.jsx";

const ANTHROPIC_MODEL_DEFAULT = "claude-sonnet-4-6";
const ANTHROPIC_MODEL_DEEP = "claude-sonnet-4-6"; // reserved seam for a stronger model later

const DEMO = true;

// Live Supabase project. The publishable key is safe in frontend code —
// it only grants what RLS allows. The service role key is the one that
// must never appear here.
const SUPABASE_URL = "https://ggfqqybjcljtqezyuxyx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QMiKmcOp-0WkYaYu9k0fpw_uXMqE9BC";
const SEARCH_FN   = `${SUPABASE_URL}/functions/v1/product-search`;
const RESEARCH_FN = `${SUPABASE_URL}/functions/v1/market-research`;

// Set this to your deployed domain, e.g. "https://myapp.vercel.app".
// Leave blank to use whatever origin the app is currently served from.
const APP_URL = "";

/* Google sign-in is hidden until the provider is configured in Supabase and
   the OAuth consent screen is set up. The button worked in testing only
   because it was never the path anyone took; on a public site an unconfigured
   provider fails for every person who tries it, and "sign in with Google"
   failing is the kind of thing people do not come back from.

   The flow itself is left intact rather than deleted — flip this to true once
   Authentication -> Providers -> Google is on and the redirect URLs match the
   live domain, and the button returns exactly as it was. */
const GOOGLE_SIGN_IN = false;

// Google OAuth needs THREE things lined up or it fails:
//   1. Google enabled in Supabase → Authentication → Providers
//   2. Your domain listed in Supabase → Authentication → URL Configuration → Redirect URLs
//   3. Supabase's callback URL pasted into Google Cloud Console → Authorized redirect URIs
// Miss any one and you get redirect_uri_mismatch or a silent bounce.
// A real page on your supabase.co domain that Google can redirect back to.
// This is what makes popup sign-in possible without a deployed app.
const CALLBACK_FN = `${SUPABASE_URL}/functions/v1/auth-callback`;

function googleAuthUrl(popup) {
  // Popup mode lands on the callback function, which posts the token back
  // to the opener. Redirect mode lands on the app itself.
  const back = popup ? CALLBACK_FN : (APP_URL || window.location.origin);
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}

// Artifacts and embeds run cross-origin inside a frame. OAuth cannot
// complete there, so detect it and say so rather than appearing broken.
function inSandboxFrame() {
  try { return window.self !== window.top; } catch { return true; }
}

// Tavily runs inside the Edge Function, never here. Set false to force the
// Claude web-search fallback.
const USE_TAVILY = true;

async function signIn(provider) {
  if (DEMO) return { email: `you@${provider}.com`, provider };
  // supabase.auth.signInWithOAuth({ provider, options:{ redirectTo:`${location.origin}/auth/callback` }})
  throw new Error("Configure the provider before disabling DEMO.");
}

const MARKETS = {
 ebay: { label: "eBay", kind: "online", sold: true, hasApi: true,
 url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13` },
 // Amazon kept as a definition only for the Reseller Essentials shop links.
 // It is deliberately excluded from ONLINE/LOCAL below, so it never appears
 // in Product Search or AI Discover results.
 amazon: { label: "Amazon", kind: "retail", hasApi: false,
 url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
 vinted: { label: "Vinted", kind: "online",
 url: (q) => `https://www.vinted.com/catalog?search_text=${encodeURIComponent(q)}` },
 mercari: { label: "Mercari", kind: "online", sold: true,
 url: (q) => `https://www.mercari.com/search/?keyword=${encodeURIComponent(q)}&status=sold_out` },
 poshmark: { label: "Poshmark", kind: "online", sold: true,
 url: (q) => `https://poshmark.com/search?query=${encodeURIComponent(q)}&availability=sold_out` },
 depop: { label: "Depop", kind: "online",
 url: (q) => `https://www.depop.com/search/?q=${encodeURIComponent(q)}` },
 offerup: { label: "OfferUp", kind: "local",
 url: (q, l = {}) => `https://offerup.com/search?q=${encodeURIComponent(q)}` +
 (l.zip ? `&zip=${l.zip}` : "") + (l.radius ? `&radius=${l.radius}` : "") },
 facebook: { label: "Marketplace", kind: "local",
 url: (q, l = {}) => `https://www.facebook.com/marketplace/search?query=${encodeURIComponent(q)}` +
 (l.radius ? `&radius=${l.radius}` : "") },
};
// Exactly the 7 resale marketplaces named in the spec. Nothing else feeds
// Product Search or AI Discover — Amazon/Walmart/etc. never appear here.
const ONLINE = ["ebay", "mercari", "vinted", "poshmark", "depop"];
const LOCAL = ["offerup", "facebook"];
const marketLabel = (key) => key === "meetup" ? "Meetup" : (MARKETS[key]?.label || key);

const SAFE_HOSTS = new Set(
 Object.values(MARKETS).map((m) => new URL(m.url("x")).hostname.replace(/^www\./, ""))
);
function safeUrl(u) {
 try {
 const parsed = new URL(u);
 if (parsed.protocol !== "https:") return null;
 const host = parsed.hostname.replace(/^www\./, "");
 return [...SAFE_HOSTS].some((h) => host === h || host.endsWith("." + h)) ? u : null;
 } catch { return null; }
}
const stripPrices = (t) => (t || "").replace(/\$\s?[\d,]+(\.\d{1,2})?/g, "").replace(/\s{2,}/g, " ").trim();

/* Where "Upgrade to premium" sends people: a Stripe Payment Link.

   Paste yours from the Stripe dashboard (Product catalogue → your product →
   Create payment link). Leaving it empty is safe — the button says so and
   does nothing, rather than opening a broken tab at somebody who is trying
   to give you money.

   This is a public URL by design. It is not a key and carries no secret;
   the secret key lives only in the Edge Function's environment. */
const STRIPE_CHECKOUT_URL = "";

/* The signed-in account, kept here so openCheckout can read it without a
   round trip.

   It has to be synchronous: reading storage first would put an await
   between the click and window.open, and Safari blocks popups that are not
   opened directly inside the click handler. A module-level value that the
   app keeps current is the honest way to have it to hand. */
let checkoutUserId = null;

/* Whether this account has paid, read from the entitlements table.

   Every failure lands on free. No session, no row, a request that errors, a
   plan that has expired — all of it returns free. That is deliberate: the
   only way to be premium is for a row to exist saying so, and only the
   service role can write one. Clicking the upgrade button grants nothing,
   and neither does anything a browser can do to this app. */
/* Reads the plan the server says this account has.

   Every failure used to come back as "free", which made a broken check look
   exactly like a genuine free account — so "I've paid, check again" could
   fail and appear simply to do nothing. A reason now comes back alongside
   the plan: the answer is still free, because nothing here may promote an
   account on its own, but the caller can say why rather than shrug.

   An expired session is the likeliest cause by far. The token is minted at
   sign-in and the grant happens afterwards, so someone who has been signed
   in a while asks with a credential the gateway refuses — and a refused
   request is not a free account. */
async function fetchEntitlement({ force = false } = {}) {
  const free = (error = null) => ({ plan: "free", expiresAt: null, error });
  try {
    const token = await sessionToken(force);
    if (!token) return free("You're signed out. Sign in again, then check.");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/entitlements?select=plan,expires_at&limit=1`,
      { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const said = d.message || d.msg || d.error_description || `the server said ${res.status}`;
      return free(res.status === 401
        ? "Your session has expired. Sign out and back in, then check again."
        : `Couldn't check your plan — ${said}.`);
    }
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.plan !== "pro") return free();
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return free("Your premium has expired.");
    }
    return { plan: "pro", expiresAt: row.expires_at || null, error: null };
  } catch (e) {
    const msg = String(e?.message || e);
    return free(/failed to fetch|networkerror|load failed/i.test(msg)
      ? "Couldn't reach the server. Check your connection and try again."
      : `Couldn't check your plan — ${msg}`);
  }
}

/* How much of an hourly allowance is left. Costs nothing to ask — the
   function reads the counter rather than incrementing it. Both the search
   and the assistant endpoints answer the same `peek` request.

   Returns null on any failure, which the caller renders as nothing at all.
   A wrong number here would be worse than no number: somebody who believes
   they have thirty left and gets refused at ten has been lied to by their
   own settings screen. */
async function fetchQuota(endpoint) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: await fnHeaders(),
      body: JSON.stringify({ peek: true }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.quota && typeof d.quota.remaining === "number" ? d.quota : null;
  } catch {
    return null;
  }
}

const AI_FN = `${SUPABASE_URL}/functions/v1/ai-assistant`;

/** The signed-in user's access token, for the JWT-gated Edge Functions.

   Supabase access tokens last about an hour. Nothing here ever refreshed
   one, so an app left open past that point had every JWT-gated call
   rejected by the gateway with a 401 — and because that rejection carries
   no CORS headers, the browser could not read it and reported a failed
   fetch instead. On screen that read as "couldn't reach the search
   service", which sent us looking at Tavily and the network when the real
   answer was that the session had quietly gone stale.

   So: refresh it, a minute before it lapses, and persist the new pair. */
/* Two calls going out together — the search and the blurb beside it — each
   found the token stale and each refreshed it. Harmless but wasteful, and it
   races: the second refresh can land first and store the older pair. One
   in-flight refresh, shared. */
let refreshInFlight = null;

/* `force` renews the token even when the stored one has not expired.

   Worth having for one case in particular: a plan granted by hand after
   someone signed in. Their token is older than the grant, and if it has
   drifted out of date the gateway refuses the request — which the app then
   has to report as "sign out and back in". Renewing first turns that into
   no problem at all, and costs one request on a button that is pressed
   rarely and deliberately. */
async function sessionToken(force = false) {
 try {
   const a = await window.storage.get("ros:session");
   if (!a) return null;
   const sess = JSON.parse(a.value);
   if (!sess.token) return null;

   const stillFresh = sess.expiresAt && sess.expiresAt * 1000 > Date.now() + 60_000;
   if (stillFresh && !force) return sess.token;
   /* A session saved before this app knew to keep refresh tokens has
      nothing to renew with. Hand back what we have; the caller will get a
      401 and the app says so plainly rather than pretending. */
   if (!sess.refresh) return sess.token;

   refreshInFlight = refreshInFlight || (async () => {
     const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
       method: "POST",
       headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
       body: JSON.stringify({ refresh_token: sess.refresh }),
     });
     if (!res.ok) return sess.token;
     const d = await res.json();
     if (!d.access_token) return sess.token;

     const next = {
       ...sess,
       token: d.access_token,
       refresh: d.refresh_token || sess.refresh,
       expiresAt: d.expires_at || Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600),
     };
     try { await window.storage.set("ros:session", JSON.stringify(next)); } catch {}
     return next.token;
   })().finally(() => { refreshInFlight = null; });

   return refreshInFlight;
 } catch { return null; }
}

/** Everything a stored session needs to outlive its access token. */
const sessionFields = (d) => ({
  token: d.access_token,
  refresh: d.refresh_token || null,
  expiresAt: d.expires_at || (d.expires_in ? Math.floor(Date.now() / 1000) + Number(d.expires_in) : null),
});

/* Headers for a call to one of this project's Edge Functions.

   All of them run with verify_jwt on, and the whole point of that is that
   only a signed-in person can spend the project's search and model credits.
   That requires sending THEIR access token — the publishable key identifies
   the project, not a user. product-search and market-research were sending
   only the publishable key, which is not a user JWT at all under the new
   sb_publishable_* key format.

   The fallback keeps demo mode working: with no session there is no token,
   and the call goes out with the publishable key exactly as it used to. */
async function fnHeaders() {
 const token = await sessionToken();
 return {
   "Content-Type": "application/json",
   apikey: SUPABASE_PUBLISHABLE_KEY,
   Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
 };
}

/* Routed through the ai-assistant Edge Function, not api.anthropic.com.
   Calling Anthropic straight from the browser cannot work: the API sends no
   CORS headers to web origins, so the request is blocked before it leaves the
   page ("Failed to fetch" / "Load failed"), and the key would be exposed even
   if it did. The key lives server-side in the function. */
async function askClaude(messages, { context = "" } = {}) {
 const headers = await fnHeaders();

 let res;
 try {
   res = await fetch(AI_FN, { method: "POST", headers, body: JSON.stringify({ messages, context }) });
 } catch {
   throw new Error("Can't reach the assistant service. The ai-assistant function may not be deployed yet, or you're offline.");
 }
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.error || `Request failed (${res.status}). Try again.`);
 return data.answer || "";
}

function salvageTuples(text) {
 const s = text.indexOf("[");
 if (s === -1) return [];
 const rows = [];
 let depth = 0, start = -1, inStr = false, esc = false;
 for (let i = s; i < text.length; i++) {
 const ch = text[i];
 if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
 if (ch === '"') { inStr = true; continue; }
 if (ch === "[") { depth++; if (depth === 2) start = i; }
 else if (ch === "]") {
 if (depth === 2 && start !== -1) { try { rows.push(JSON.parse(text.slice(start, i + 1))); } catch {} start = -1; }
 depth--; if (depth === 0) break;
 }
 }
 return rows;
}

async function describeProduct(query) {
 const text = await askClaude(
 [{ role: "user", content:
`In 1-2 plain sentences, what is "${query}"? Describe the product itself — what it is, who wants it, why it holds resale value. No prices. No preamble. Under 40 words.` }],
 { maxTokens: 200 }
 );
 return stripPrices(text.trim());
}

// Routing: don't spend a web search on a question the user's own data
// already answers. "What did I make this month?" is Supabase, not the web.
const WEB_HINTS = ["trending","trend","right now","this week","currently","latest",
  "market","popular","demand","going for","worth","hot","news","selling well"];
const OWN_DATA_HINTS = ["my ","i made","i sold","i have","inventory","my sales",
  "my profit","restock","slowest","best product","how am i"];
function needsWebSearch(q) {
  const s = q.toLowerCase();
  if (OWN_DATA_HINTS.some((h) => s.includes(h))) return false;
  return WEB_HINTS.some((h) => s.includes(h));
}

/* Seed queries for AI Discover, per category.

   Discover has to start somewhere: unlike Product Search there is no term
   from the user, so it picks a seed and reads back what is actually listed
   against it.

   These are deliberately category-level rather than specific products. A
   seed like "air force 1" returns twenty listings of one shoe, which
   collapses to a single card — correct, but it can never fill five. A seed
   like "sneakers" returns listings for many different shoes, which is what
   a discovery screen is for. */
const DISCOVER_SEEDS = {
  Shoes: ["sneakers", "jordan sneakers", "nike shoes", "adidas sneakers",
    "new balance sneakers", "running shoes", "designer sneakers", "basketball shoes",
    "skate shoes", "vintage sneakers"],
  Clothes: ["vintage jacket", "designer hoodie", "streetwear jacket", "vintage t-shirt",
    "fleece jacket", "denim jacket", "workwear jacket", "vintage sweatshirt",
    "puffer jacket", "designer shirt"],
  Jewelry: ["gold chain", "silver ring", "tennis bracelet", "gold bracelet",
    "vintage ring", "pendant necklace"],
  Accessories: ["mens watch", "vintage watch", "sunglasses", "designer bag",
    "leather wallet", "smart watch", "crossbody bag"],
  Headwear: ["fitted cap", "vintage hat", "snapback", "trucker hat", "beanie"],
  Colognes: ["mens cologne", "designer fragrance", "eau de parfum", "perfume bottle",
    "niche fragrance"],
  Other: ["game console", "wireless headphones", "kitchen appliance", "power tool",
    "lego set", "trading cards", "camera", "tablet", "smart speaker", "hair tool"],
};
/* Local resale is a different trade — bulky things that cost too much to
   ship, which is exactly why they are sold face to face. */
const LOCAL_SEEDS = ["treadmill", "dresser", "power tools", "bicycle", "sectional couch",
  "lawn mower", "air compressor", "patio furniture", "mini fridge", "dewalt drill"];

/* Marketplace label back to the key the app uses everywhere else. The search
   function returns "eBay"; MARKETS is keyed "ebay". */
const MARKET_KEY = Object.fromEntries(
  Object.entries(MARKETS).map(([k, m]) => [m.label.toLowerCase(), k]));

/* Remembering the last seed is what makes "Find again" mean it. Without it
   the same random pick could come up twice in a row and the button would
   look broken. */
let lastDiscoverSeed = "";
function pickSeed(pool) {
  const options = pool.length > 1 ? pool.filter((x) => x !== lastDiscoverSeed) : pool;
  lastDiscoverSeed = options[Math.floor(Math.random() * options.length)];
  return lastDiscoverSeed;
}

/* Last-resort product source: the app's own reference catalog.

   Both remote paths need a reachable backend and a key — Tavily through the
   product-search function, then Claude through ai-assistant. When neither
   is configured every search died on the second failure and the screen
   showed an error instead of products. Matching the built-in catalog means
   the search always returns something real, and these rows actually carry
   fuller data than the web paths do: demand, competition, trend and a
   90-day sold count, so Analyze opens a complete detail sheet.

   `matched` records whether the query hit anything, so the UI can say
   "no match, here's what is in the catalog" rather than implying these
   were search results. */
function catalogMatches(query, reason = "") {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const scored = CATALOG
    .map((c) => {
      const hay = `${c.title} ${c.cat}`.toLowerCase();
      return { c, hits: words.filter((w) => hay.includes(w)).length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const hit = scored.length > 0;
  return (hit ? scored.map((x) => x.c) : CATALOG).map((c) => ({
    title: c.title,
    market: marketLabel(c.source),
    cond: "reference data",
    // A real sold-listings search on that marketplace. Honest about what it
    // is: a search page for the product, not one specific listing.
    url: MARKETS[c.source]?.url?.(c.title) || "",
    source: "catalog",
    matched: hit,
    /* Why the live path didn't happen, in the function's own words. Without
       this the screen said only "live search is unavailable", which is true
       but useless — the function knows exactly what is wrong and says so in
       its response body, and that message was being thrown away. */
    reason,
  }));
}

const SearchProvider = {
 async searchProducts(query, marketplaces = ONLINE, mode = "online") {
   // Preferred path: Tavily via the Edge Function. Real listing pages,
   // domain-restricted at the source, key never exposed.
   let why = "";
   if (USE_TAVILY) {
     try {
       const res = await fetch(SEARCH_FN, {
         method: "POST",
         headers: await fnHeaders(),
         /* marketplaces is what the filter chips select. It used to be
            computed in ProductSearch and then dropped here, so picking
            "eBay" searched all five online boards exactly like "All". */
         /* Asked for across all the selected marketplaces, not from each.
            The function divides this between them and deals the answers out
            one board at a time. Ten was the old figure from when a single
            search covered every board at once, and it was the other half of
            why results got thin. */
         body: JSON.stringify({ query, mode, marketplaces, maxResults: 24 }),
       });
       if (!res.ok) {
         /* The function reports its own faults precisely — a missing
            TAVILY_API_KEY, an upstream Tavily status — so read the body
            rather than guessing from the status code. Only the curated
            `error` field is surfaced; `detail` can carry upstream noise. */
         const body = await res.json().catch(() => ({}));
         why = String(body.error || `Search service returned ${res.status}.`).slice(0, 160);
       }
       if (res.ok) {
         const data = await res.json();
         if (Array.isArray(data.results) && data.results.length) {
           const rows = data.results.map((r) => ({
             title: stripPrices(r.title), market: r.market,
             cond: "", url: safeUrl(r.url), image: r.image || null,
             snippet: r.snippet || "", source: "tavily",
           })).filter((r) => r.url);
           /* Only return these if something survived safeUrl. The function
              searches craigslist.org for local queries, which is not one of
              the marketplaces this app covers and so is not on the app's
              host allowlist — a local search returning mostly Craigslist
              used to come back as an empty array, which rendered as a blank
              results list with nothing to explain it. Falling through
              instead gets the reader the catalog and a sentence saying why. */
           if (rows.length) return rows;
         }
       }
       // non-OK, empty, or nothing left after filtering falls through below
     } catch {
       why = "Couldn't reach the search service.";
     }
   }

   // Second try: Claude with web search. Slower and less precise, but works
   // without the product-search function being reachable.
   //
   // This used to be the end of the line, and it threw — which is why the
   // search stopped working entirely once askClaude started going through
   // the ai-assistant function. A failure here is no longer fatal; it falls
   // through to the catalog below.
   try {
     const text = await askClaude(
       [{ role: "user", content:
`Search the web for real, currently purchasable listings matching: "${query}".
Only from these marketplaces: ${marketplaces.map((m) => MARKETS[m]?.label).join(", ")}.

Output ONLY a JSON array, 10 items max. No preamble, no fences.
Each: ["listing title","marketplace","condition or empty string","direct https url to the listing"]
Rules: real listing pages only, never news/blogs/forums/videos/articles. Never include a price anywhere. Be terse.` }],
     );
     const rows = salvageTuples(text.replace(/```json|```/g, ""))
       .filter((t) => Array.isArray(t) && t[0] && t[3])
       .map((t) => ({ title: stripPrices(String(t[0])), market: String(t[1] || ""),
         cond: stripPrices(String(t[2] || "")), url: safeUrl(String(t[3])), source: "claude" }))
       .filter((r) => r.url)
       .slice(0, 10);
     if (rows.length) return rows;
   } catch { /* unreachable or unconfigured — fall through */ }

   // Always something to show, and always a reason why it is this.
   return catalogMatches(query, why);
 },

 async searchLocalProducts(query, loc = {}, marketplaces = LOCAL) {
   return SearchProvider.searchProducts(
     `${query} ${loc.zip || loc.state || ""}`.trim(), marketplaces, "local");
 },

 // Current market info for the chatbot. Returns SOURCES so the assistant
 // cites instead of asserts, plus how old the freshest source is.
 async researchMarket(question, depth = "basic") {
   if (USE_TAVILY) {
     try {
       const res = await fetch(RESEARCH_FN, {
         method: "POST",
         headers: await fnHeaders(),
         body: JSON.stringify({ question, depth }),
       });
       if (res.ok) {
         const d = await res.json();
         if (d.answer || d.sources?.length) {
           return { answer: stripPrices(d.answer || ""), sources: d.sources || [],
                    stale: !!d.stale, retrievedAt: d.retrievedAt, via: "tavily" };
         }
       }
     } catch { /* fall through */ }
   }
   // Fallback: Claude with web search
   const text = await askClaude(
     [{ role: "user", content:
`Search the web and answer briefly: ${question}

Under 90 words. Facts only, no preamble. Never state a purchase or buy price.
End with a line starting "SOURCES:" listing the URLs you used, comma separated.` }],
     { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }] }
   );
   const cut = text.lastIndexOf("SOURCES:");
   const body = cut > -1 ? text.slice(0, cut) : text;
   const urls = cut > -1 ? text.slice(cut + 8).split(",").map((u) => u.trim()).filter(Boolean) : [];
   return { answer: stripPrices(body.trim()),
            sources: urls.slice(0, 5).map((u) => ({ title: u.replace(/^https?:\/\//, "").split("/")[0], url: u })),
            stale: false, retrievedAt: new Date().toISOString(), via: "claude" };
 },

/* Signals for a product that isn't in the reference catalog — which is
    every result a live search returns.

    Two passes over the same marketplaces: active listings, then completed
    ones. That gives two counts that are genuinely observed rather than
    modelled, and between them they answer the two questions that matter —
    how many other people are selling this, and is it actually moving.

    Both counts are samples, not totals. Tavily returns at most 20 per pass,
    so a busy product reports 20 and means "at least 20". Every screen that
    shows these says so; presenting a sample as a total would be worse than
    showing nothing. */
 async analyzeProduct(title, { marketplaces = ONLINE, mode = "online" } = {}) {
   const pass = async (sold) => {
     const res = await fetch(SEARCH_FN, {
       method: "POST",
       headers: await fnHeaders(),
       body: JSON.stringify({ query: title, mode, marketplaces, sold, maxResults: 20 }),
     });
     if (!res.ok) {
       /* The function explains itself — a spent quota, a rate limit, a bad
          key — and that sentence is far more use than the status code. */
       const body = await res.json().catch(() => ({}));
       throw new Error(String(body.error || `Search service returned ${res.status}.`).slice(0, 160));
     }
     return res.json();
   };

   const [active, sold] = await Promise.all([pass(false), pass(true)]);
   const listings = Number(active.count) || 0;
   const soldSeen = Number(sold.count) || 0;

   return {
     listings,
     soldSeen,
     /* Both passes cap at 20, so anything at the cap is a floor. */
     listingsCapped: listings >= 20,
     soldCapped: soldSeen >= 20,
     markets: active.markets || [],
     soldMarkets: sold.markets || [],
     /* Sold listings per marketplace. Counted, not modelled — this is how
        many the search actually returned from each board. */
     soldByMarket: sold.marketCounts || {},
     /* Sale dates read off the completed listings themselves ("Sold Sep 12").
        Only some listings state one, so this is always a subset of soldSeen —
        `datedCount` says how big a subset, and nothing is filled in for the
        listings that stayed silent. */
     soldDates: Array.isArray(sold.soldDates) ? sold.soldDates : [],
     /* The same dates split by marketplace, so the breakdown under the chart
        adds up to the line above it. */
     soldDatesByMarket: sold.datesByMarket && typeof sold.datesByMarket === "object" ? sold.datesByMarket : {},
     datedCount: Number(sold.datedCount) || 0,
     retrievedAt: active.retrievedAt || new Date().toISOString(),
   };
 },

 async getRecentSoldData(title, windowDays = 30) {
 const ref = CATALOG.find((c) => c.title === title);
 if (!ref) return { count: null, windowDays, estimated: true, unavailable: true };
 /* comps90 is a 90-day figure. The fractions run a little above the plain
    day ratio because recent weeks carry more of a 90-day total than an even
    split would give them. */
 const scale = windowDays >= 30 ? 0.4 : windowDays >= 21 ? 0.28 : 0.12;
 return { count: Math.max(1, Math.round(ref.comps90 * scale)), windowDays, estimated: true };
 },

 async findSimilarProducts(item, pool = CATALOG) {
 return pool.filter((p) => p.cat === item.cat && p.title !== item.title)
 .sort((a, b) => (b.vel / (b.sellers || 1)) - (a.vel / (a.sellers || 1)))
 .slice(0, 3);
 },

 async getMarketSignals(f) {
 const local = f.mode === "local";
 const mode = local ? "local" : "online";
 const marketplaces = local ? LOCAL : ONLINE;

 /* Live path, and the reason this screen works at all now. Discover used
    to go only through Claude, so when that key had no credit the whole
    screen fell back to six catalog rows — while Product Search, which
    goes through Tavily, was working fine two chips away. Same search
    service as Product Search, seeded with a rotating category term. */
 try {
   const pool = local ? LOCAL_SEEDS
     : (DISCOVER_SEEDS[f.cat] || Object.values(DISCOVER_SEEDS).flat());

   /* Listing titles repeat heavily — twenty results are often the same
      item twenty times — so collapse on the opening words, otherwise
      "5 products" would be one product five times. */
   const seen = new Set();
   const picked = [];
   const seeds = [];

   /* Up to three seeds, stopping as soon as there are five distinct
      products. One seed usually suffices; a narrow category on a quiet
      day might not, and coming back with two cards would look broken. */
   for (let attempt = 0; attempt < 3 && picked.length < 5; attempt++) {
     const seed = pickSeed(pool);
     seeds.push(seed);
     const res = await fetch(SEARCH_FN, {
       method: "POST",
       headers: await fnHeaders(),
       body: JSON.stringify({ query: seed, mode, marketplaces, maxResults: 20 }),
     });
     if (!res.ok) break;
     const data = await res.json();

     const fresh = (data.results || [])
       .map((r) => ({ ...r, url: safeUrl(r.url) }))
       .filter((r) => r.url && r.title)
       .filter((r) => {
         const k = stripPrices(r.title).toLowerCase().split(/\s+/).slice(0, 4).join(" ");
         if (seen.has(k)) return false;
         seen.add(k);
         return true;
       });

     /* Shuffled, so the same seed twice still turns the set over rather
        than returning the same five in the same order. */
     for (let i = fresh.length - 1; i > 0; i--) {
       const j = Math.floor(Math.random() * (i + 1));
       [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
     }
     picked.push(...fresh);
   }

   const rows = picked.slice(0, 5).map((r, i) => ({
     rank: i + 1,
     title: stripPrices(r.title),
     cat: f.cat && f.cat !== "All" ? f.cat : (local ? "Local" : "Other"),
     source: MARKET_KEY[String(r.market || "").toLowerCase()] || (local ? "offerup" : "ebay"),
     url: r.url,
     /* Left null on purpose. These are live listings, not catalog rows —
        See More measures them for real rather than the card asserting a
        demand figure nobody counted. */
     comp: null, vel: null, sellers: null, comps90: null, trend: "flat",
     why: "", origin: "tavily", seeds,
   }));
   if (rows.length) return rows;
 } catch { /* fall through to the paths below */ }

 const where = local
 ? `sourced LOCALLY and resold — bulky/heavy items that cost too much to ship: furniture, tools, exercise equipment, appliances, bikes.${f.state ? ` Bias toward ${f.state}.` : ""}`
 : `sourced and resold ONLINE — small, light, identifiable items: cologne, sneakers, streetwear, watches, bags, electronics.`;
 const catHint = f.cat && f.cat !== "All" ? ` Focus only on the "${f.cat}" category.` : "";
 try {
 const text = await askClaude(
 [{ role: "user", content:
`Search the web for what is selling fastest in resale right now, ${where}${catHint}

Output ONLY a JSON array of 20 arrays. No preamble, no fences.
Each: ["product name","category",recent_sold_price_usd,sales_per_week,sellers_competing,"up"|"flat"|"down","why it moves"]
Rules: specific products with model/size detail; integers for price; "why" max 5 words; fastest first; terse. NEVER include a purchase or buy price — recent_sold_price_usd is what it resells for, nothing else.` }],
 );
 const rows = salvageTuples(text.replace(/```json|```/g, ""))
 .filter((t) => Array.isArray(t) && t[0] && Number(t[2]) > 0)
 .map((t, i) => ({
 rank: i + 1, title: stripPrices(String(t[0])), cat: String(t[1] || "—"),
 comp: Number(t[2]), vel: Number(t[3]) || null, sellers: Number(t[4]) || null,
 trend: ["up", "flat", "down"].includes(t[5]) ? t[5] : "flat",
 why: t[6] ? stripPrices(String(t[6])) : "", source: local ? "offerup" : "ebay", comps90: null,
 })).slice(0, 20);
 if (rows.length) return rows;
 } catch { /* unreachable or unconfigured — fall through */ }

 /* Same reasoning as searchProducts: this threw when the assistant function
    wasn't reachable, so Find products showed an error and no products. The
    reference catalog keeps the screen working, ranked by sell speed the way
    the live path is, and marked so nobody mistakes it for live web data. */
 const rows = CATALOG
 .filter((c) => !f.cat || f.cat === "All" || c.cat === f.cat)
 .slice()
 .sort((a, b) => b.vel - a.vel)
 .slice(0, 5)
 .map((c, i) => ({ ...c, rank: i + 1, why: c.why || "", origin: "catalog" }));
 if (!rows.length) throw new Error(`No ${f.cat} products in the built-in catalog. Try All, or a different category.`);
 return rows;
 },
};

/* What to call this person on screen. A display name set in Settings wins;
   otherwise fall back to how they signed in — username first, then the local
   part of the email, which reads as a name where the full address does not.
   Returns "" when there is nothing to go on, so each caller picks its own
   wording for that case. */
function displayName(user, profile) {
  const set = (profile?.name || "").trim();
  if (set) return set;
  const uname = (user?.username || "").trim();
  if (uname) return uname;
  // Signing in by username puts that username in `email`, and splitting a
  // string with no "@" in it just returns the string.
  const mail = (user?.email || "").trim();
  return mail ? mail.split("@")[0] : "";
}

/* Labels for observed live counts. Deliberately not the same functions as
   demandLabel/compLabel, which read catalog fields on a different scale —
   sharing them would have quietly implied the two are measured the same
   way. Thresholds are per sample of at most 20. */
const seenCompLabel = (n) => n >= 15 ? "High" : n >= 6 ? "Medium" : n > 0 ? "Low" : "None found";
const seenDemandLabel = (n) => n >= 10 ? "High" : n >= 4 ? "Medium" : n > 0 ? "Low" : "None found";
const seenSatLabel = (listings, soldSeen) => {
  if (!listings) return "Unknown";
  if (!soldSeen) return "Crowded";
  const ratio = listings / soldSeen;
  return ratio >= 3 ? "Crowded" : ratio >= 1.5 ? "Filling up" : "Room to move";
};

/* A date input hands back "2026-09-19", and `new Date("2026-09-19")` reads
   that as midnight **UTC**. Seven hours west of Greenwich midnight UTC is
   still the previous evening, so every date the app stored and showed came
   back a day early. Read as local midnight instead: the calendar day someone
   picked is the calendar day they see, wherever they are.

   Returns null for anything unusable, which also covers the cleared-field
   case — `new Date("").toISOString()` throws a RangeError, and with no error
   boundary above it that used to take the whole sheet out silently. */
const localMidnight = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  /* Rejects the impossible without trusting Date, which rolls Feb 30 forward
     to Mar 2 rather than complaining. */
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
};
const validDate = (v) => !!localMidnight(v);

const demandLabel = (vel) => vel == null ? "Unknown" : vel >= 6 ? "High" : vel >= 3 ? "Medium" : "Low";
const compLabel = (sellers) => sellers == null ? "Unknown" : sellers >= 50 ? "High" : sellers >= 20 ? "Medium" : "Low";
const satLabel = (vel, sellers) => {
 if (vel == null || sellers == null) return "Unknown";
 const ratio = sellers / Math.max(vel, 0.5);
 return ratio >= 15 ? "Crowded" : ratio >= 7 ? "Filling up" : "Room to move";
};
const riskLabel = (comps90) => comps90 == null ? "Unknown" : comps90 >= 20 ? "Lower" : comps90 >= 8 ? "Moderate" : "Higher — thin sales history";

function verdict(item) {
 if (item.vel == null || item.sellers == null) return { label: "NOT ENOUGH DATA", tone: "neutral" };
 let score = 0;
 score += item.vel >= 6 ? 2 : item.vel >= 3 ? 0 : -2;
 score += item.sellers <= 20 ? 2 : item.sellers <= 50 ? 0 : -2;
 if (item.trend === "up") score += 1;
 if (item.trend === "down") score -= 1;
 if (item.comps90 != null) score += item.comps90 >= 15 ? 1 : item.comps90 < 5 ? -1 : 0;
 return score >= 0 ? { label: "VERY GOOD", tone: "good" } : { label: "VERY BAD", tone: "bad" };
}

function iconForCategory(cat) {
 const c = (cat || "").toLowerCase();
 if (c.includes("shoe") || c.includes("sneaker")) return Footprints;
 if (c.includes("cologne") || c.includes("fragrance")) return Droplets;
 if (c.includes("cloth") || c.includes("streetwear") || c.includes("outerwear")) return Shirt;
 if (c.includes("jewel")) return Gem;
 if (c.includes("access") || c.includes("watch")) return Watch;
 if (c.includes("headwear") || c.includes("hat")) return ShoppingBag;
 return Package;
}
function Thumb({ cat, size = 52 }) {
 const Icon = iconForCategory(cat);
 return (
 <div style={{ width: size, height: size, borderRadius: size * 0.28, flexShrink: 0, background: C.raised, border: `1px solid ${C.line}`, display: "grid", placeItems: "center" }}>
 <Icon size={size * 0.42} color={C.dim} strokeWidth={1.7} />
 </div>
 );
}

const money = (n) => (n < 0 ? "−" : "") + Math.abs(n).toFixed(2);
const money0 = (n) => (n < 0 ? "−$" : "$") + Math.abs(n).toFixed(0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function profitFrom({ sell, cost, feePct = 0, pay = 0, ship = 0, other = 0 }) {
 const fees = sell * (feePct / 100) + sell * (pay / 100);
 const profit = sell - cost - fees - ship - other;
 return { fees, profit, margin: sell ? (profit / sell) * 100 : 0, roi: cost ? (profit / cost) * 100 : 0 };
}

const CATEGORIES = [
 { key: "Shoes", q: "jordan", Icon: Footprints },
 { key: "Clothes", q: "carhartt", Icon: Shirt },
 { key: "Jewelry", q: "gold", Icon: Gem },
 { key: "Accessories",q: "seiko", Icon: Watch },
 { key: "Headwear", q: "supreme", Icon: ShoppingBag },
 { key: "Colognes", q: "sauvage", Icon: Droplets },
 { key: "Other", q: "", Icon: Package },
];
const TICKET = (comp) => comp >= 100 ? "high" : "low";

/* Reference products, by category.

   These are modelled figures, not measurements — the app says so wherever
   they are shown, and that framing must not be quietly dropped. They exist
   so Saturation has something to rank when live search is unavailable or
   has not been run, not to assert what is happening on any marketplace
   today.

   There were six of these, which is why every category filter showed one
   item or none and why the same four products appeared under every
   heading. */
const CATALOG = [
 // Shoes
 { title: "Jordan 1 Low Panda US 9", cat: "Shoes", source: "mercari", comp: 112, vel: 8.1, sellers: 71, comps90: 44, trend: "up" },
 { title: "Nike Dunk Low Panda US 10", cat: "Shoes", source: "ebay", comp: 118, vel: 9.3, sellers: 96, comps90: 52, trend: "down" },
 { title: "New Balance 550 White Green", cat: "Shoes", source: "ebay", comp: 95, vel: 5.2, sellers: 38, comps90: 26, trend: "up" },
 { title: "Adidas Samba OG White", cat: "Shoes", source: "poshmark", comp: 105, vel: 7.4, sellers: 64, comps90: 41, trend: "up" },
 { title: "Asics Gel-Kayano 14 Silver", cat: "Shoes", source: "mercari", comp: 128, vel: 4.6, sellers: 29, comps90: 19, trend: "up" },
 { title: "Yeezy Slide Onyx US 10", cat: "Shoes", source: "ebay", comp: 82, vel: 3.1, sellers: 47, comps90: 14, trend: "down" },

 // Clothes
 { title: "Carhartt Detroit Jacket L", cat: "Clothes", source: "depop", comp: 148, vel: 4.2, sellers: 31, comps90: 21, trend: "up" },
 { title: "Nike Tech Fleece Hoodie L", cat: "Clothes", source: "mercari", comp: 74, vel: 6.8, sellers: 83, comps90: 37, trend: "flat" },
 { title: "Levi's 501 Vintage W32", cat: "Clothes", source: "depop", comp: 58, vel: 5.4, sellers: 52, comps90: 28, trend: "up" },
 { title: "Patagonia Better Sweater M", cat: "Clothes", source: "poshmark", comp: 89, vel: 4.9, sellers: 36, comps90: 24, trend: "up" },
 { title: "Stussy Basic Tee L", cat: "Clothes", source: "depop", comp: 46, vel: 3.3, sellers: 58, comps90: 15, trend: "down" },
 { title: "The North Face Nuptse 700 L", cat: "Clothes", source: "ebay", comp: 165, vel: 3.8, sellers: 27, comps90: 18, trend: "up" },

 // Jewelry
 { title: "Gold plated Cuban chain 18in", cat: "Jewelry", source: "mercari", comp: 74, vel: 3.7, sellers: 88, comps90: 17, trend: "down" },
 { title: "Pandora Moments charm bracelet", cat: "Jewelry", source: "poshmark", comp: 52, vel: 4.4, sellers: 61, comps90: 22, trend: "flat" },
 { title: "Sterling silver rope chain 20in", cat: "Jewelry", source: "ebay", comp: 68, vel: 2.9, sellers: 44, comps90: 13, trend: "flat" },
 { title: "Tennis bracelet 4mm CZ", cat: "Jewelry", source: "mercari", comp: 41, vel: 3.2, sellers: 72, comps90: 11, trend: "down" },
 { title: "14k gold hoop earrings", cat: "Jewelry", source: "poshmark", comp: 130, vel: 2.6, sellers: 23, comps90: 12, trend: "up" },

 // Accessories
 { title: "Casio G-Shock GA-2100", cat: "Accessories", source: "mercari", comp: 104, vel: 6.4, sellers: 55, comps90: 29, trend: "up" },
 { title: "Seiko 5 SNK809 automatic", cat: "Accessories", source: "ebay", comp: 118, vel: 3.9, sellers: 26, comps90: 17, trend: "up" },
 { title: "Coach Willow Tote pebbled", cat: "Accessories", source: "poshmark", comp: 145, vel: 4.1, sellers: 34, comps90: 20, trend: "up" },
 { title: "Ray-Ban Wayfarer 2140", cat: "Accessories", source: "ebay", comp: 92, vel: 5.1, sellers: 67, comps90: 26, trend: "flat" },
 { title: "Apple AirPods Pro 2nd gen", cat: "Accessories", source: "ebay", comp: 155, vel: 9.7, sellers: 104, comps90: 58, trend: "down" },
 { title: "Louis Vuitton Neverfull MM", cat: "Accessories", source: "poshmark", comp: 980, vel: 1.8, sellers: 19, comps90: 8, trend: "up" },

 // Headwear
 { title: "Supreme Camp Cap", cat: "Headwear", source: "depop", comp: 68, vel: 2.4, sellers: 26, comps90: 9, trend: "flat" },
 { title: "New Era 59Fifty Yankees 7 1/4", cat: "Headwear", source: "ebay", comp: 38, vel: 4.7, sellers: 79, comps90: 21, trend: "down" },
 { title: "Carhartt Acrylic Watch Hat", cat: "Headwear", source: "mercari", comp: 22, vel: 5.9, sellers: 91, comps90: 27, trend: "flat" },
 { title: "Patagonia Trucker Hat", cat: "Headwear", source: "poshmark", comp: 34, vel: 3.4, sellers: 42, comps90: 16, trend: "up" },
 { title: "Nike Club Cap unstructured", cat: "Headwear", source: "mercari", comp: 24, vel: 3.0, sellers: 63, comps90: 12, trend: "down" },

 // Colognes
 { title: "Dior Sauvage EDT 100ml", cat: "Colognes", source: "ebay", comp: 142, vel: 5.8, sellers: 34, comps90: 23, trend: "up" },
 { title: "Bleu de Chanel EDP 100ml", cat: "Colognes", source: "ebay", comp: 158, vel: 4.6, sellers: 29, comps90: 21, trend: "up" },
 { title: "Versace Eros EDT 100ml", cat: "Colognes", source: "mercari", comp: 78, vel: 5.2, sellers: 57, comps90: 25, trend: "flat" },
 { title: "YSL Y EDP 100ml", cat: "Colognes", source: "ebay", comp: 112, vel: 3.8, sellers: 38, comps90: 18, trend: "up" },
 { title: "Creed Aventus 100ml", cat: "Colognes", source: "ebay", comp: 385, vel: 2.1, sellers: 22, comps90: 11, trend: "up" },
 { title: "Jean Paul Gaultier Le Male 125ml", cat: "Colognes", source: "mercari", comp: 74, vel: 4.3, sellers: 66, comps90: 19, trend: "down" },

 // Other
 { title: "Nintendo Switch OLED console", cat: "Other", source: "ebay", comp: 265, vel: 6.2, sellers: 61, comps90: 33, trend: "flat" },
 { title: "Sony WH-1000XM4 headphones", cat: "Other", source: "ebay", comp: 178, vel: 5.5, sellers: 48, comps90: 29, trend: "up" },
 { title: "Lego Star Wars UCS sealed set", cat: "Other", source: "ebay", comp: 320, vel: 2.7, sellers: 24, comps90: 14, trend: "up" },
 { title: "Pokemon 151 booster bundle", cat: "Other", source: "ebay", comp: 88, vel: 7.9, sellers: 87, comps90: 45, trend: "down" },
 { title: "Stanley Quencher 40oz", cat: "Other", source: "mercari", comp: 42, vel: 6.6, sellers: 112, comps90: 31, trend: "down" },
 { title: "Kindle Paperwhite 11th gen", cat: "Other", source: "ebay", comp: 95, vel: 3.6, sellers: 33, comps90: 17, trend: "flat" },
];

/* The local catalog, which is a different business.

   Local resale is not online resale with a shorter shipping label. It is
   the things shipping makes uneconomic — furniture, tools, appliances,
   exercise equipment — bought and collected within driving distance. So
   Saturation's Local tab had no business showing the same sneakers and
   colognes as Online, which is exactly what it was doing: the mode chip
   was decorative and both tabs read from the same list.

   Same categories as Online so the filter chips still mean something, but
   every product is one that actually moves locally. */
const LOCAL_CATALOG = [
 // Shoes
 { title: "Red Wing Iron Ranger boots 10", cat: "Shoes", source: "offerup", comp: 165, vel: 1.9, sellers: 12, comps90: 7, trend: "up" },
 { title: "Soccer cleats youth, mixed sizes", cat: "Shoes", source: "facebook", comp: 25, vel: 3.4, sellers: 41, comps90: 14, trend: "flat" },
 { title: "Work boots steel toe 11", cat: "Shoes", source: "offerup", comp: 55, vel: 2.6, sellers: 27, comps90: 11, trend: "flat" },
 { title: "Ski boots 27.5 with bag", cat: "Shoes", source: "facebook", comp: 90, vel: 1.4, sellers: 18, comps90: 6, trend: "down" },

 // Clothes
 { title: "Kids clothing bulk lot 0-2T", cat: "Clothes", source: "facebook", comp: 35, vel: 5.8, sellers: 74, comps90: 24, trend: "flat" },
 { title: "Carhartt work coat XL", cat: "Clothes", source: "offerup", comp: 85, vel: 2.9, sellers: 22, comps90: 12, trend: "up" },
 { title: "Wedding dress size 8", cat: "Clothes", source: "facebook", comp: 220, vel: 0.9, sellers: 15, comps90: 4, trend: "down" },
 { title: "Winter coats bundle adult", cat: "Clothes", source: "offerup", comp: 60, vel: 2.2, sellers: 33, comps90: 9, trend: "flat" },

 // Jewelry
 { title: "Estate costume jewelry lot", cat: "Jewelry", source: "facebook", comp: 45, vel: 1.7, sellers: 29, comps90: 7, trend: "flat" },
 { title: "Scrap gold and silver lot", cat: "Jewelry", source: "offerup", comp: 240, vel: 1.2, sellers: 11, comps90: 5, trend: "up" },
 { title: "Vintage watch lot untested", cat: "Jewelry", source: "facebook", comp: 75, vel: 1.5, sellers: 19, comps90: 6, trend: "flat" },

 // Accessories
 { title: "Graco 4Ever car seat", cat: "Accessories", source: "facebook", comp: 110, vel: 4.2, sellers: 48, comps90: 19, trend: "up" },
 { title: "UPPAbaby Vista stroller", cat: "Accessories", source: "offerup", comp: 340, vel: 2.1, sellers: 16, comps90: 9, trend: "up" },
 { title: "Yeti Tundra 45 cooler", cat: "Accessories", source: "offerup", comp: 185, vel: 2.4, sellers: 21, comps90: 11, trend: "flat" },
 { title: "Golf club set with bag", cat: "Accessories", source: "facebook", comp: 150, vel: 3.1, sellers: 37, comps90: 15, trend: "flat" },

 // Headwear
 { title: "Motorcycle helmet DOT medium", cat: "Headwear", source: "offerup", comp: 80, vel: 1.6, sellers: 17, comps90: 6, trend: "flat" },
 { title: "Bike helmets kids lot", cat: "Headwear", source: "facebook", comp: 20, vel: 2.3, sellers: 31, comps90: 8, trend: "down" },
 { title: "Welding helmet auto-darkening", cat: "Headwear", source: "offerup", comp: 65, vel: 1.1, sellers: 9, comps90: 4, trend: "up" },

 // Colognes
 { title: "Perfume lot partial bottles", cat: "Colognes", source: "facebook", comp: 40, vel: 1.3, sellers: 24, comps90: 5, trend: "down" },
 { title: "Sealed designer gift set", cat: "Colognes", source: "offerup", comp: 70, vel: 1.8, sellers: 18, comps90: 7, trend: "flat" },

 // Other — the heart of local resale
 { title: "Peloton Bike original", cat: "Other", source: "facebook", comp: 450, vel: 3.6, sellers: 52, comps90: 22, trend: "down" },
 { title: "IKEA Kallax 4x4 shelf", cat: "Other", source: "facebook", comp: 70, vel: 6.4, sellers: 88, comps90: 31, trend: "flat" },
 { title: "DeWalt 20V drill kit", cat: "Other", source: "offerup", comp: 130, vel: 5.1, sellers: 44, comps90: 26, trend: "up" },
 { title: "Sectional couch grey fabric", cat: "Other", source: "facebook", comp: 280, vel: 4.8, sellers: 96, comps90: 28, trend: "down" },
 { title: "Weight plates Olympic 45lb pair", cat: "Other", source: "offerup", comp: 95, vel: 4.4, sellers: 39, comps90: 21, trend: "up" },
 { title: "Craftsman lawn mower self-propelled", cat: "Other", source: "facebook", comp: 175, vel: 3.2, sellers: 34, comps90: 16, trend: "flat" },
 { title: "Mini fridge 3.2 cu ft", cat: "Other", source: "offerup", comp: 75, vel: 3.9, sellers: 57, comps90: 18, trend: "flat" },
 { title: "Samsung 55in 4K TV", cat: "Other", source: "facebook", comp: 210, vel: 5.6, sellers: 71, comps90: 29, trend: "down" },
 { title: "Dining table with 4 chairs", cat: "Other", source: "facebook", comp: 160, vel: 3.4, sellers: 62, comps90: 17, trend: "flat" },
 { title: "Trek hybrid bike medium frame", cat: "Other", source: "offerup", comp: 240, vel: 2.8, sellers: 26, comps90: 13, trend: "up" },
 { title: "Honda EU2200i generator", cat: "Other", source: "offerup", comp: 680, vel: 1.7, sellers: 14, comps90: 8, trend: "up" },
 { title: "Washer and dryer set", cat: "Other", source: "facebook", comp: 420, vel: 2.9, sellers: 41, comps90: 15, trend: "flat" },
];

/* Search suggestions. The old list was ten entries, so typing almost
   anything produced one match or none. These are products that actually
   move in resale, spread across the categories the app already knows
   about, so a couple of letters lands on something useful. */
const VOCAB = [...new Set([...CATALOG.map((c) => c.title),
 // Sneakers
 "Jordan 1 Low", "Jordan 1 High", "Jordan 3", "Jordan 4", "Jordan 11",
 "Nike Dunk Low Panda", "Nike Dunk Low", "Air Force 1", "New Balance 550",
 "New Balance 990", "Yeezy Slide", "Yeezy 350", "Adidas Samba", "Asics Gel-Kayano",
 "Salomon XT-6", "Air Max 90", "Air Max 95", "Travis Scott Jordan",
 // Streetwear and clothing
 "Supreme Box Logo Hoodie", "Carhartt Detroit Jacket", "Carhartt Double Knee",
 "Stussy Hoodie", "The North Face Nuptse", "Patagonia Fleece", "Arc'teryx Beta",
 "Nike Tech Fleece", "Essentials Fear of God", "Levi's 501 Vintage",
 "Harley Davidson Tee", "Vintage Band Tee", "Ralph Lauren Polo Bear",
 // Fragrance
 "Dior Sauvage", "Creed Aventus", "Bleu de Chanel", "Baccarat Rouge 540",
 "Tom Ford Tobacco Vanille", "Versace Eros", "YSL Y EDP",
 // Watches and accessories
 "Casio G-Shock", "Seiko SKX007", "Seiko 5", "Casio F91W", "Apple Watch",
 "Ray-Ban Wayfarer", "Oakley Sunglasses",
 // Bags
 "Coach Tabby", "Louis Vuitton Neverfull", "Telfar Shopping Bag", "Jansport Backpack",
 // Electronics
 "PS5", "PS5 Controller", "Nintendo Switch", "Nintendo Switch OLED", "Steam Deck",
 "AirPods Pro", "Sony WH-1000XM4", "Sony WH-1000XM5", "iPad", "Kindle Paperwhite",
 "Meta Quest 3", "GoPro Hero", "Nintendo DS Lite",
 // Home and tools
 "Dyson Airwrap", "Dyson V8", "Instant Pot", "Ninja Creami", "Stanley Tumbler",
 "KitchenAid Mixer", "Le Creuset Dutch Oven", "DeWalt Drill", "Milwaukee M18",
 // Collectibles
 "Pokemon Booster Box", "Pokemon Card Lot", "Lego Star Wars Set", "Funko Pop Grail",
])];

const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

const ESSENTIALS = [
 { name: "Ring light", cat: "Photo Setup", note: "Even light for every listing photo, day or night." },
 { name: "Phone tripod", cat: "Photo Setup", note: "Sharp, consistent shots without holding the phone." },
 { name: "Backdrop", cat: "Photo Setup", note: "One clean background makes a whole catalog look uniform." },
 { name: "Clothing steamer", cat: "Product Care", note: "Wrinkle-free garments photograph and sell better." },
 { name: "Fabric shaver", cat: "Product Care", note: "Removes pilling from knits before listing." },
 { name: "Shoe cleaning kit", cat: "Product Care", note: "Restores sneakers before resale photos." },
 { name: "Shipping scale", cat: "Shipping Supplies", note: "Accurate weight avoids surprise postage costs." },
 { name: "Thermal label printer", cat: "Shipping Supplies", note: "Fast label printing with no ink cost." },
];

/* Four palettes, two light and two dark.

   onAccent is the reason this has one more token than it used to. Text on
   an accent used to be hardcoded white, which is fine over a strong red and
   illegible over gold: white on #C6A15B measures 2.4:1, and on #D4AF63 it
   is 2.1:1. Each palette now names the colour that actually reads on its
   own accent, and every pairing below was measured rather than eyeballed —
   body text clears 4.5:1 against all three backgrounds it can sit on, and
   the accent's own text clears 4.5:1 too.

   Two values differ slightly from the palettes as specified, both for the
   same reason. Pearl's steel blue and Ivory's sage are lovely as supporting
   colours but too light to read as small text on white, so the tint is kept
   and the value darkened until it clears; Pearl's blue is a shade deeper so
   that white on it passes rather than nearly passes. */
const THEMES = {
 ivory: { name: "Luxury Ivory", sub: "Ivory + Champagne Gold",
   void:"#F7F5F0", panel:"#FFFFFF", raised:"#F0ECE3", line:"#E4DFD3",
   accent:"#C6A15B", accentDim:"#A07E3C", accentText:"#7A5E28", onAccent:"#1C1C1C",
   bone:"#1C1C1C", dim:"#63635B", dead:"#87877E" },
 pearl: { name: "Pearl Blue", sub: "Pearl + Royal Blue",
   void:"#F4F7FA", panel:"#FFFFFF", raised:"#E9EFF6", line:"#D9E3ED",
   accent:"#4A75A4", accentDim:"#365777", accentText:"#365777", onAccent:"#FFFFFF",
   bone:"#172033", dim:"#566878", dead:"#758C9E" },
 obsidian: { name: "Obsidian Gold", sub: "Obsidian + Luxury Gold",
   void:"#0D0F10", panel:"#15181A", raised:"#1E2225", line:"#2B3033",
   accent:"#D4AF63", accentDim:"#8A6F35", accentText:"#D4AF63", onAccent:"#0D0F10",
   bone:"#F5F1E8", dim:"#9DA29C", dead:"#6C736D" },
 emerald: { name: "Midnight Emerald", sub: "Midnight Green + Emerald",
   void:"#0B1210", panel:"#121A17", raised:"#1A2420", line:"#26312C",
   accent:"#45B58A", accentDim:"#2A7458", accentText:"#45B58A", onAccent:"#0B1210",
   bone:"#F1F4EF", dim:"#95A59B", dead:"#657A70" },
};

const C = {
 void:"var(--c-void)", panel:"var(--c-panel)", raised:"var(--c-raised)", line:"var(--c-line)",
 accent:"var(--c-accent)", accentDim:"var(--c-accentDim)",
 accentText:"var(--c-accentText)", onAccent:"var(--c-onAccent)",
 bone:"var(--c-bone)", dim:"var(--c-dim)", dead:"var(--c-dead)",
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "'Archivo', ui-sans-serif, system-ui, sans-serif";

const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 };
const pillBtn = (on) => ({ borderRadius: 999, padding: "9px 16px", cursor: "pointer", fontSize: 13,
 fontWeight: on ? 700 : 600, background: on ? C.accent : "transparent",
 color: on ? C.onAccent : C.dim, border: `1px solid ${on ? C.accent : C.line}` });
const inputSt = { padding: "12px 16px", fontFamily: SANS, fontSize: 14.5, color: C.bone,
 background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999, width: "100%" };
const label = { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim };
const rise = (i = 0) => ({ animationDelay: `${i * 55}ms` });
const MOTIVATION = ["Let's make some money.", "Let's build this wealth.", "Time to grow the business.", "Let's find the next winner."];

const DEFAULTS = {
 profile: { name: "", username: "", state: "", zip: "", radius: 25, onboarded: false, theme: "obsidian" },
 settings: { feePct: 13.25, payPct: 2.9, ship: 8, startingBalance: 0,
 notif: { opps: true, satur: true, demand: true, local: true }, aiUseData: true },
 inventory: [], sales: [], watchlist: [], notifications: [], readNotifs: [],
};

/* ── Talking to the database ────────────────────────────────────────────

   Small REST helpers over Supabase's PostgREST endpoint, using the signed-in
   user's own token. Every request therefore arrives as that user, and Row
   Level Security decides what they may touch — the browser never gets to
   choose whose rows it reads. */
async function sbRest(path, { method = "GET", body, prefer } = {}) {
  const token = await sessionToken();
  if (!token) throw new Error("signed out");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/* The app hands `put` a whole array every time — "here is the inventory now"
   — rather than "add this one row". So a save is a reconcile: upsert
   everything present, then delete whatever is no longer in the list. These
   lists are tens of rows, not thousands, so doing it wholesale is both
   simpler and harder to get wrong than tracking individual edits. */
async function syncCollection(table, userId, rows, toRow) {
  const mapped = rows.map((r) => ({ ...toRow(r), user_id: userId }));
  if (mapped.length) {
    await sbRest(table, { method: "POST", body: mapped, prefer: "resolution=merge-duplicates,return=minimal" });
  }
  /* Anything the client no longer has is gone. Scoped to this user by the
     filter as well as by RLS — belt and braces on a destructive call. */
  const keep = mapped.map((r) => `"${String(r.id).replace(/"/g, "")}"`).join(",");
  const filter = mapped.length ? `&id=not.in.(${keep})` : "";
  await sbRest(`${table}?user_id=eq.${userId}${filter}`, { method: "DELETE", prefer: "return=minimal" });
}

/* Shapes. The database uses snake_case and the app uses camelCase; these two
   pairs are the only place that difference is allowed to exist. */
const invToRow = (i) => ({
  id: String(i.id), title: i.title ?? "", units: Number(i.units) || 1,
  units_left: Math.max(0, Number(i.unitsLeft) || 0), cost: Number(i.cost) || 0,
  purchase_date: i.purchaseDate || null, notes: i.notes || null,
  added_at: i.addedAt || new Date().toISOString(), sold_out_at: i.soldOutAt || null,
  updated_at: new Date().toISOString(),
});
const rowToInv = (r) => ({
  id: r.id, title: r.title, units: r.units, unitsLeft: r.units_left, cost: Number(r.cost),
  purchaseDate: r.purchase_date, notes: r.notes || "", addedAt: r.added_at, soldOutAt: r.sold_out_at,
});
const saleToRow = (x) => ({
  id: String(x.id), item_id: x.itemId ? String(x.itemId) : null, title: x.title ?? "",
  qty: Number(x.qty) || 1, amount: Number(x.amount) || 0, cost: Number(x.cost) || 0,
  fees: Number(x.fees) || 0, other: Number(x.other) || 0, profit: Number(x.profit) || 0,
  market: x.market || null, method: x.method || null,
  sold_at: x.soldAt || new Date().toISOString(), updated_at: new Date().toISOString(),
});
const rowToSale = (r) => ({
  id: r.id, itemId: r.item_id, title: r.title, qty: r.qty, amount: Number(r.amount),
  cost: Number(r.cost), fees: Number(r.fees), other: Number(r.other), profit: Number(r.profit),
  market: r.market, method: r.method, soldAt: r.sold_at,
});
const watchToRow = (w) => ({ title: w.title, category: w.cat || null, notes: JSON.stringify(w) });
const rowToWatch = (r) => {
  try { const full = JSON.parse(r.notes || "null"); if (full?.title) return full; } catch {}
  return { title: r.title, cat: r.category || "Other", trend: "flat" };
};

/* Every stored key is scoped to the account that owns it.

   It was not. Keys were `ros:inventory`, `ros:sales`, `ros:profile` and so
   on, with no account attached, and signing out cleared only `ros:session`.
   So a browser held exactly one set of data and every account that logged in
   on it saw the same inventory, the same sales, the same profit. On a shared
   computer that is two people reading each other's finances — a privacy
   leak, not a sync problem.

   This is a stopgap, and worth being honest about what it does and does not
   fix. It stops accounts seeing each other's data on one device. It does not
   make anyone's data follow them to a second device, because the data still
   lives in that browser. The real fix is Postgres, one row per user, which
   is the next piece of work. */
const dbKey = (scope, k) => `ros:u:${scope}:${k}`;

/* The unscoped keys left over from before this change belong to somebody —
   on a personal device, to the person still using it. They are handed to the
   first account that signs in after the upgrade and then deleted, so a
   second account cannot inherit them too.

   On a shared device that first account might be the wrong one. That is a
   worse-than-ideal outcome for one person, once, and it replaces the current
   behaviour where every account sees the data forever. */
const LEGACY_CLAIMED = "ros:legacy-claimed";

async function claimLegacyData(scope) {
 try {
   if (await window.storage.get(LEGACY_CLAIMED)) return;
   for (const k of Object.keys(DEFAULTS)) {
     const legacy = await window.storage.get(`ros:${k}`);
     if (!legacy) continue;
     /* Never overwrite data this account already has. */
     const existing = await window.storage.get(dbKey(scope, k));
     if (!existing) await window.storage.set(dbKey(scope, k), legacy.value);
     await window.storage.delete(`ros:${k}`);
   }
   await window.storage.set(LEGACY_CLAIMED, String(scope));
 } catch {}
}

/* Reads everything this account owns, in one go. Returns null if the
   database could not be reached at all, which is different from an account
   that genuinely has nothing — the caller must not confuse the two or an
   offline moment would look like deleted data. */
async function loadRemote(userId) {
 try {
   const [inv, sales, watch, prof] = await Promise.all([
     sbRest(`inventory?user_id=eq.${userId}&select=*&order=added_at.desc`),
     sbRest(`sales?user_id=eq.${userId}&select=*&order=sold_at.desc`),
     sbRest(`watchlist?user_id=eq.${userId}&select=*`),
     sbRest(`profiles?id=eq.${userId}&select=*`),
   ]);
   const row = Array.isArray(prof) ? prof[0] : null;
   return {
     inventory: (inv || []).map(rowToInv),
     sales: (sales || []).map(rowToSale),
     watchlist: (watch || []).map(rowToWatch),
     profile: row
       ? { name: row.name || "", username: row.username || "", state: row.state || "",
           zip: row.zip || "", radius: row.radius ?? 25, onboarded: !!row.onboarded,
           theme: row.theme || "obsidian" }
       : null,
     settings: row?.settings || null,
   };
 } catch {
   return null;
 }
}

function useStore(scope, userId) {
 const [db, setDb] = useState(DEFAULTS);
 const [ready, setReady] = useState(false);
 /* null when everything is saved, a message when the last save did not
    reach the server. The browser copy is still correct either way. */
 const [syncError, setSyncError] = useState(null);

 /* Re-runs whenever the signed-in account changes, including to nobody on
    sign-out — which is what drops the previous person's data out of memory
    rather than leaving it on screen for whoever logs in next. */
 useEffect(() => {
 let alive = true;
 setReady(false);
 setSyncError(null);
 (async () => {
 if (!scope) { if (alive) { setDb(DEFAULTS); setReady(true); } return; }

 /* The browser copy first, so the screen fills immediately and still
    works on a dead connection. */
 await claimLegacyData(scope);
 const local = { ...DEFAULTS };
 for (const k of Object.keys(DEFAULTS)) {
 try { const r = await window.storage.get(dbKey(scope, k)); if (r) local[k] = JSON.parse(r.value); } catch {}
 }
 if (!local.notifications.length) local.notifications = seedNotifications(local.profile);
 if (alive) { setDb(local); setReady(true); }

 if (!userId) return;
 const remote = await loadRemote(userId);
 if (!alive) return;

 /* Unreachable. Keep showing the browser copy and say so, rather than
    blanking the screen or pretending the data is gone. */
 if (!remote) { setSyncError("Working offline — changes are saved on this device and will sync when you're back."); return; }

 const remoteEmpty = !remote.inventory.length && !remote.sales.length && !remote.watchlist.length;
 const localHas = local.inventory.length || local.sales.length || local.watchlist.length;

 if (remoteEmpty && localHas) {
 /* First sign-in since this account's data moved to the server. Send up
    what is in this browser, once, so nobody loses what they typed. */
 try {
 await pushAll(userId, local);
 setSyncError(null);
 } catch (e) {
 setSyncError("Couldn't upload this device's data yet. It's still saved here.");
 }
 return;
 }

 /* The server is the truth from here on. */
 const merged = {
 ...local,
 inventory: remote.inventory,
 sales: remote.sales,
 watchlist: remote.watchlist,
 ...(remote.profile ? { profile: remote.profile } : {}),
 ...(remote.settings ? { settings: { ...DEFAULTS.settings, ...remote.settings } } : {}),
 };
 setDb(merged);
 for (const k of ["inventory", "sales", "watchlist", "profile", "settings"]) {
 try { await window.storage.set(dbKey(scope, k), JSON.stringify(merged[k])); } catch {}
 }
 })();
 return () => { alive = false; };
 }, [scope, userId]);

 const put = async (key, value) => {
 setDb((d) => ({ ...d, [key]: value }));
 if (!scope) return;
 /* Browser first and always. If the network call below fails, or the tab
    closes mid-save, the change is already safe on this device. */
 try { await window.storage.set(dbKey(scope, key), JSON.stringify(value)); } catch {}
 if (!userId) return;
 try {
 await pushKey(userId, key, value);
 setSyncError(null);
 } catch {
 setSyncError("That change is saved on this device but hasn't reached the server yet.");
 }
 };

 const reset = async () => {
 if (scope) {
 for (const k of Object.keys(DEFAULTS)) { try { await window.storage.delete(dbKey(scope, k)); } catch {} }
 }
 if (userId) {
 try {
 await Promise.all([
 sbRest(`inventory?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }),
 sbRest(`sales?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }),
 sbRest(`watchlist?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }),
 ]);
 } catch {}
 }
 setDb(DEFAULTS);
 };
 return { db, ready, put, reset, syncError };
}

/* One key's worth of state, sent to wherever it belongs. */
async function pushKey(userId, key, value) {
 if (key === "inventory") return syncCollection("inventory", userId, value, invToRow);
 if (key === "sales") return syncCollection("sales", userId, value, saleToRow);
 if (key === "watchlist") return syncCollection("watchlist", userId, value, watchToRow);
 if (key === "profile") {
 return sbRest(`profiles?id=eq.${userId}`, { method: "PATCH", prefer: "return=minimal",
 body: { name: value.name || "", state: value.state || null, zip: value.zip || null,
 radius: value.radius ?? 25, theme: value.theme || "obsidian", onboarded: !!value.onboarded } });
 }
 if (key === "settings") {
 return sbRest(`profiles?id=eq.${userId}`, { method: "PATCH", prefer: "return=minimal", body: { settings: value } });
 }
 /* notifications and readNotifs are generated per device and not worth a
    round trip; they stay in the browser. */
}

async function pushAll(userId, local) {
 for (const k of ["inventory", "sales", "watchlist", "profile", "settings"]) {
 await pushKey(userId, k, local[k]);
 }
}

function seedNotifications(profile) {
 const where = profile.zip ? `within ${profile.radius || 25} miles of ${profile.zip}` : "in your area";
 return [
 { id: "n1", icon: "🔥", kind: "opp", title: "Product opportunity detected",
 preview: "New opportunity based on your recent interests.",
 body: "Demand on streetwear appears to be rising this week based on recent web coverage. Worth a look in Discover.",
 at: new Date(Date.now() - 3 * 36e5).toISOString() },
 { id: "n2", icon: "📈", kind: "demand", title: "Demand increasing",
 preview: "A category you've looked at is picking up.",
 body: "Colognes are showing more search interest than last week. Check Discover for current sold activity.",
 at: new Date(Date.now() - 20 * 36e5).toISOString() },
 { id: "n3", icon: "📍", kind: "local", title: "Low competition near you",
 preview: `${where}, one category looks under-served.`,
 body: `Outerwear has fewer competing listings ${where} right now. See Saturation → Local for specifics.`,
 at: new Date(Date.now() - 40 * 36e5).toISOString() },
 { id: "n4", icon: "⚠️", kind: "satur", title: "A product is becoming oversaturated",
 preview: "Seller count is climbing on something you viewed.",
 body: "Gold-plated chains have a fast-growing seller count. Consider Saturation → Show Alternatives.",
 at: new Date(Date.now() - 30 * 36e5).toISOString() },
 ];
}

function useBusiness(db, range) {
 return useMemo(() => {
 const now = Date.now();
 const cutoff = range === "today" ? new Date().setHours(0,0,0,0)
 : range === "7" ? now - 7 * 864e5
 : range === "30" ? now - 30 * 864e5 : 0;
 const sales = db.sales.filter((s) => new Date(s.soldAt).getTime() >= cutoff);
 const revenue = sales.reduce((a, s) => a + s.amount, 0);
 const cost = sales.reduce((a, s) => a + s.cost, 0);
 const fees = sales.reduce((a, s) => a + s.fees, 0);
 const expenses= sales.reduce((a, s) => a + (s.other || 0), 0);
 const profit = sales.reduce((a, s) => a + s.profit, 0);
 const invValue = db.inventory.reduce((a, i) => a + i.unitsLeft * i.cost, 0);
 const totalSpent = db.inventory.reduce((a, i) => a + i.units * i.cost, 0);
 const allRealizedProfit = db.sales.reduce((a, s) => a + s.profit, 0);
 const balance = (db.settings.startingBalance || 0) + allRealizedProfit;
 const byMarket = {}; sales.forEach((s) => { byMarket[s.market] = (byMarket[s.market] || 0) + s.profit; });
 const byProduct = {}; sales.forEach((s) => { byProduct[s.title] = (byProduct[s.title] || 0) + s.profit; });
 return {
 revenue, cost, fees, expenses, profit, invValue, totalSpent, balance,
 itemsSold: sales.length,
 bestMarket: Object.entries(byMarket).sort((a, b) => b[1] - a[1])[0],
 bestProduct: Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0],
 weekBuckets: Array.from({ length: 7 }, (_, i) => {
 const d = new Date(now - (6 - i) * 864e5).toDateString();
 return db.sales.filter((s) => new Date(s.soldAt).toDateString() === d).reduce((a, s) => a + s.profit, 0);
 }),
 };
 }, [db, range]);
}

function Styles({ theme }) {
 const t = THEMES[theme] || THEMES.ivory;

 /* Two things CSS in this component cannot reach on its own.

    The status-bar strip on iOS and the browser chrome on Android take their
    colour from a meta tag, not from a stylesheet. It was hard-coded dark,
    right for two of the four palettes and wrong for the other two.

    And the document's own background is set inline in index.html so the
    first paint is not white — an inline style beats a stylesheet rule, so
    the theme has to be applied the same way rather than through the CSS
    below, which would silently lose. */
 useEffect(() => {
   let tag = document.querySelector('meta[name="theme-color"]');
   if (!tag) {
     tag = document.createElement("meta");
     tag.setAttribute("name", "theme-color");
     document.head.appendChild(tag);
   }
   tag.setAttribute("content", t.void);
   document.documentElement.style.background = t.void;
   document.body.style.background = t.void;
 }, [t.void]);

 return (
 <style>{`
 @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
 .reseller-root {
 --c-void:${t.void}; --c-panel:${t.panel}; --c-raised:${t.raised}; --c-line:${t.line};
 --c-accent:${t.accent}; --c-accentDim:${t.accentDim};
 --c-accentText:${t.accentText}; --c-onAccent:${t.onAccent};
 --c-bone:${t.bone}; --c-dim:${t.dim}; --c-dead:${t.dead};

 /* One hover glow, defined once and used everywhere, so every element
    lights up identically. Both layers are centred — no y-offset — because
    an offset pools the light at the bottom instead of ringing the shape
    evenly. --glow-focus is the same recipe turned up for focus. */
 --glow: 0 0 0 3px color-mix(in srgb, var(--c-accent) 16%, transparent),
         0 0 18px 0 color-mix(in srgb, var(--c-accent) 45%, transparent);
 --glow-focus: 0 0 0 4px color-mix(in srgb, var(--c-accent) 24%, transparent),
               0 0 24px 0 color-mix(in srgb, var(--c-accent) 55%, transparent);
 }
 * { box-sizing: border-box; }
 input::placeholder, textarea::placeholder { color: ${C.dead}; }

 /* Stops iOS Safari zooming the page when a field is tapped.

    Safari does that to any input whose computed font-size is under 16px,
    and it does not zoom back out afterwards — which is the "it zooms in on
    certain parts" you get wandering around the app on a phone. Sixteen
    pixels is the threshold, not a preference, so the fields are raised to
    exactly that on touch devices and left at their designed size on
    desktop, where the behaviour does not exist.

    Everything is raised and then the two deliberately-large cases are put
    back, rather than listing every small field: that way a field added
    later is covered without anyone having to remember this. The important
    flags are needed because these sizes are set inline. */
 @media (pointer: coarse) {
   input, select, textarea { font-size: 16px !important; }
   .otp-in { font-size: 24px !important; }
   .fld-big { font-size: 20px !important; }
 }

 /* And stops Safari inflating body text of its own accord on rotation. */
 html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

 /* The page's own ground, painted on html and body rather than only on the
    app's root element.

    The root element covers the viewport, but the viewport is not everything
    a phone shows. Rubber-band scrolling drags the page past its own edge,
    and the notch and home-indicator strips sit outside it too — and in both
    of those places the browser paints the *body*, which had no background
    at all and so came out white. That is the white band at the top and
    bottom on every screen, login included.

    Set from the live theme, so the light palettes get their own ground
    rather than a dark bar. */
 html, body { background: ${t.void}; }
 #root { background: ${t.void}; min-height: 100%; }

 /* Keeps the colour under the notch and the home indicator rather than
    leaving those strips to the browser's default. */
 @supports (padding: env(safe-area-inset-top)) {
   body { background-color: ${t.void}; }
 }
 @keyframes rise { from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:none;} }
 .rise { opacity:0; animation: rise .5s cubic-bezier(.2,.7,.3,1) forwards; }
 @keyframes sweep { 0%{transform:translateX(-100%)} 100%{transform:translateX(360%)} }
 @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
 @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
 .skel { background: linear-gradient(90deg, ${C.raised} 25%, ${C.line} 50%, ${C.raised} 75%);
 background-size:400px 100%; animation: shimmer 1.4s infinite linear; border-radius:10px; }
 .fx { transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .16s, background .16s, border-color .16s, color .16s; }
 .fx:hover { transform: translateY(-2px); }
 .fx:active { transform: translateY(0) scale(.97); }
 /* Hover glow. A tight accent ring reads as an outline at any size, and the
    wide soft shadow underneath is what makes it glow rather than just
    outline. Both are colour, not motion, so they survive reduced motion. */
 .fx-accent:hover { box-shadow: var(--glow); }
 .fx-card:hover { border-color: ${C.accent} !important; background: ${C.raised} !important;
   box-shadow: var(--glow); }
 .fx-chip:hover { border-color: ${C.accent} !important; color: ${C.bone} !important;
   box-shadow: var(--glow); }
 .lnk { transition: background .15s, color .15s, border-color .15s; }
 .lnk:hover { background:${C.accent} !important; color:#fff !important; border-color:${C.accent} !important; }

 /* ── Desktop tab row ──────────────────────────────────────────────
    The section names in a row across the top, on wide screens only.
    This adds the row and nothing else: the page keeps its width, the
    bottom bar stays where it is, and every screen lays out exactly as
    it does on a phone. */
 /* The app's only navigation, at every screen size. It scrolls sideways
    rather than wrapping or clipping, so no tab is ever unreachable however
    narrow the screen gets. */
 .topnav {
   display: flex;
   overflow-x: auto;
   scrollbar-width: none;
   -ms-overflow-style: none;
 }
 .topnav::-webkit-scrollbar { height: 0; }
 .topnav-link {
   background: none; border: none; padding: 0 1px 8px; cursor: pointer;
   font-family: inherit; font-size: 13.5px; font-weight: 600;
   letter-spacing: -0.01em; white-space: nowrap;
   /* Grey at rest — the row shouldn't compete with the page. */
   color: var(--c-dead);
   border-bottom: 2px solid transparent;
   transition: color .16s, border-color .16s, background .16s,
               box-shadow .16s, transform .16s cubic-bezier(.2,.7,.3,1);
 }
 /* Hovering and being on the tab read the same: the word takes the
    theme's accent. The underline is what separates "could go here"
    from "am here". */
 .topnav-link:hover { color: var(--c-accentText); }
 .topnav-link[aria-current="page"] { color: var(--c-accentText); border-bottom-color: var(--c-accentText); }

 /* ── Phone tab row: bubbles ───────────────────────────────────────
    The icons drop out and each name gets its own capsule, sharing the
    width equally so the five read as one segmented control rather than a
    line of text. The bubble is what carries state here, so the desktop
    underline is switched off — two markers for one thing is noise.

    Touch has no hover, so the bubble has to answer to three states: it
    fills on hover for anyone on a trackpad, presses in on :active for a
    finger, and sits filled on whichever tab you're on. */
 @media (max-width: 699px) {
   .topnav { gap: 4px !important; }
   .topnav-link {
     flex: 1 1 0; min-width: 0; justify-content: center;
     font-size: 11px; letter-spacing: -0.02em;
     padding: 7px 3px;
     border-radius: 999px;
     border-bottom-color: transparent !important;
   }
   .topnav-link svg { display: none; }

   .topnav-link:hover {
     background: color-mix(in srgb, var(--c-accent) 13%, transparent);
     box-shadow: var(--glow);
     transform: translateY(-1px);
   }
   /* A finger gets the squash instead of the lift. */
   .topnav-link:active { transform: scale(.93); }
   .topnav-link[aria-current="page"] {
     background: color-mix(in srgb, var(--c-accent) 20%, transparent);
     color: var(--c-accentText);
   }
   .topnav-link[aria-current="page"]:hover {
     background: color-mix(in srgb, var(--c-accent) 26%, transparent);
   }
 }

 /* ── Desktop layout ────────────────────────────────────────────────
    One URL, two layouts. Everything below 1200px renders the phone
    layout it always has; at 1200px and up the content column opens out
    and tops out at 1440px. So a phone gets the phone layout and a
    desktop gets the desktop one off the same link, with no device
    sniffing — just the window width, which is the thing that actually
    matters. */
 @media (min-width: 1200px) {
   .shell {
     max-width: 1440px !important;
     padding-left: 40px !important;
     padding-right: 40px !important;
   }
   /* Four stat tiles across instead of two-by-two. At 1440px wide a 2×2
      grid gives each tile ~660px to hold one short number, which reads as
      a mistake rather than a layout. */
   .stat-grid { grid-template-columns: repeat(4, 1fr) !important; }
   .fab { right: 26px !important; }
 }

 /* For a host showing the app at phone size inside a wider window — a
    preview frame, an embed. Media queries read the window, not the box, so
    without this a 412px-wide frame would get the desktop column and the
    four-across tiles. Nothing sets this in normal use. */
 [data-layout="mobile"] .shell {
   max-width: 560px !important; padding-left: 16px !important; padding-right: 16px !important;
 }
 [data-layout="mobile"] .stat-grid { grid-template-columns: 1fr 1fr !important; }
 [data-layout="mobile"] .fab { right: 18px !important; }
 /* The phone treatment of the tab row keys off the window too, so pin it
    here as well. */
 [data-layout="mobile"] .topnav { gap: 4px !important; }
 [data-layout="mobile"] .topnav-link {
   flex: 1 1 0 !important; min-width: 0 !important; justify-content: center !important;
   font-size: 11px !important; letter-spacing: -0.02em !important;
   padding: 7px 3px !important;
   border-radius: 999px !important;
   border-bottom-color: transparent !important;
 }
 [data-layout="mobile"] .topnav-link svg { display: none !important; }
 [data-layout="mobile"] .topnav-link:hover {
   background: color-mix(in srgb, var(--c-accent) 13%, transparent) !important;
   box-shadow: var(--glow) !important;
   transform: translateY(-1px);
 }
 [data-layout="mobile"] .topnav-link:active { transform: scale(.93); }
 [data-layout="mobile"] .topnav-link[aria-current="page"] {
   background: color-mix(in srgb, var(--c-accent) 20%, transparent) !important;
   color: var(--c-accentText) !important;
 }
 [data-layout="mobile"] .topnav-link[aria-current="page"]:hover {
   background: color-mix(in srgb, var(--c-accent) 26%, transparent) !important;
 }

 /* The mirror image: a host rendering the app at desktop width inside a
    window that may be any size. Same reason as above — the media query
    reads the window, not the box — so a desktop preview frame opened on a
    laptop, a tablet or a phone still shows the desktop layout. Nothing
    sets this in normal use either. */
 [data-layout="desktop"] .topnav { display: flex !important; }
 [data-layout="desktop"] .shell {
   max-width: 1440px !important; padding-left: 40px !important; padding-right: 40px !important;
 }
 [data-layout="desktop"] .stat-grid { grid-template-columns: repeat(4, 1fr) !important; }
 [data-layout="desktop"] .fab { right: 26px !important; }
 [data-layout="desktop"] .topnav { gap: 26px !important; }
 [data-layout="desktop"] .topnav-link { font-size: 13.5px !important; }
 [data-layout="desktop"] .topnav-link svg { display: flex !important; }

 /* Collapsible stock heading. The row is full width, so fx-chip's glow
    would ring the whole line — a plain colour shift is the right weight
    here. !important because the label style is inline and would win. */
 .stock-head:hover { color: var(--c-bone) !important; }
 .stock-head:hover svg { color: var(--c-accentText); }
 button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible, textarea:focus-visible {
 outline: 2px solid ${C.accent}; outline-offset: 3px; }
 ::-webkit-scrollbar { width:0; height:0; }
 /* Keep the hover glow, drop the hover movement — without this the lift
    still happens, just instantly, which is worse for motion sensitivity
    than a smooth one. */
 @media (prefers-reduced-motion: reduce) {
   *{animation:none !important; transition:none !important} .rise{opacity:1 !important}
   .fx:hover, .fx:active { transform: none !important; }
   /* The tab bubbles keep their colour, lose their lift and squash. */
   .topnav-link:hover, .topnav-link:active { transform: none !important; }
 }
 `}</style>
 );
}

const Wrap = ({ children }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
const Bar = ({ pct, color }) => (
 <div style={{ height: 6, background: C.raised, borderRadius: 999, overflow: "hidden" }}>
 <div style={{ height: "100%", width: `${clamp(pct, 0, 100)}%`, background: color || C.accent, borderRadius: 999, transition: "width .6s cubic-bezier(.2,.7,.3,1)" }} />
 </div>
);
const Tag = ({ children }) => (
 <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 999, color: C.dead, border: `1px solid ${C.line}` }}>{children}</span>
);

// ═══════════ real Supabase auth, over the REST endpoints ═══════════
// No SDK needed — these are the same endpoints @supabase/supabase-js calls.
// If the sandbox blocks the request we fall back to demo mode rather than
// leaving the user staring at a dead button.

/* GoTrue's error shape has changed across versions: older builds answer
   { error, error_description }, newer ones { code, error_code, msg }. Read
   every variant, then translate the codes worth translating — for these the
   raw text is either jargon or actively misleading about whose problem it
   is. "Error sending recovery email" in particular reads like the address
   was wrong when it means the project's own mail sending is broken.

   Anything unrecognised is passed through with its code or status attached,
   so "it gives an error" is something that can be diagnosed rather than
   guessed at. */
/* Supabase stores addresses lowercased, so "Antonio@..." and "antonio@..."
   are the same account to it. The app was passing through whatever case was
   typed, which meant the address it saved as the person's identity could
   differ from the one on the account — and any comparison against it, now
   or later, would quietly disagree. Trim and lowercase once, at the edge. */
const cleanEmail = (v) => String(v || "").trim().toLowerCase();

const AUTH_ERRORS = {
  /* Deliberately vague about how long. GoTrue enforces two separate limits
     here — a short per-address cooldown measured in seconds, and a
     project-wide hourly cap that is only a couple of messages on the
     built-in mailer — and the response does not say which one was hit.
     Promising "a minute" when the real wait is an hour is worse than not
     saying, so the exact figure is only named when GoTrue supplies it (see
     authError below). */
  over_email_send_rate_limit: "This site has sent as many emails as it's allowed to for now. Try again a little later.",
  email_send_failed: "Supabase couldn't send the email. That's the project's mail setup, not your address — check Authentication → Emails → SMTP Settings.",
  same_password: "That's the password you already had. Pick a different one.",
  weak_password: "Supabase rejected that password as too easy to guess. Try a different one.",
  otp_expired: "That link or code has expired. Send yourself a new one.",
  reauthentication_needed: "Supabase wants a fresh login before the password can change. Log in, then change it from Settings.",
  user_not_found: "No account with that address.",
};

function authError(status, d, fallback) {
  const code = String(d?.error_code || (typeof d?.code === "string" ? d.code : "") || "").toLowerCase();
  const raw = d?.error_description || d?.msg || d?.message ||
    (typeof d?.error === "string" ? d.error : "");
  /* Before the code lookup, not after: GoTrue sends the countdown in the
     message while also setting error_code, so checking the code first would
     return the vague answer and throw away the exact one. */
  const secs = raw.match(/after (\d+) seconds?/i);
  if (secs) return `Just a moment — you can ask for another email in ${secs[1]} seconds.`;

  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];

  /* Older GoTrue builds send the message with no code at all, so the text
     is the only thing to go on. Matching on it is unlovely but it is what
     those versions give us, and the alternative is showing raw server
     prose for the cases we have already written plain answers to. */
  if (status >= 500 && /mail|smtp|email/i.test(raw)) {
    return `Supabase couldn't send the email${raw ? ` — ${raw}` : ""}. Check Authentication → Emails → SMTP Settings.`;
  }
  if (/should be different|same as the old/i.test(raw)) return AUTH_ERRORS.same_password;
  if (/weak|easy to guess|pwned|breach/i.test(raw))      return AUTH_ERRORS.weak_password;
  if (/expired|already been used/i.test(raw))            return AUTH_ERRORS.otp_expired;
  if (/reauthentication/i.test(raw))                     return AUTH_ERRORS.reauthentication_needed;
  if (/only request this after|rate limit/i.test(raw)) return AUTH_ERRORS.over_email_send_rate_limit;
  const detail = raw || fallback;
  return code ? `${detail} (${code})` : status ? `${detail} [${status}]` : detail;
}

async function supabaseAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(authError(res.status, data, "Sign-in failed."));
  return data;
}

/* ═══════════ password reset ═══════════

   Three separate moments, and they run in different browser sessions:

     1. "Forgot?" on the login tab  -> POST /recover, Supabase emails a link
     2. the link lands back here    -> a one-hour session arrives in the hash
     3. that session authorises     -> PUT /user with the new password

   Step 2 is the part that needs configuring outside this file: Supabase
   only redirects to an address listed under Authentication -> URL
   Configuration -> Redirect URLs. An address that isn't listed silently
   falls back to the Site URL, which is why a reset link can appear to work
   and still land somewhere else. */

function resetRedirectUrl() {
  return APP_URL || (window.location.origin + window.location.pathname);
}

/* GoTrue answers 200 whether or not that address has an account, and that
   is deliberate: a different answer for a real address would turn this form
   into an account-existence oracle. So the caller says the same thing
   either way, and this never reports "no such user". */
async function sendRecoveryEmail(email) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(resetRedirectUrl())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ email }),
    },
  );
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(authError(res.status, d, "Couldn't send the reset email."));
  return true;
}

/* Sets a new password using the short-lived session the recovery link
   carried. That session is the whole authorisation — there is no old
   password to supply, which is the point of the flow. It is not stored
   anywhere until the change succeeds, so an abandoned reset leaves nothing
   signed in behind it. */
async function updatePassword(accessToken, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(authError(res.status, d, "Couldn't update the password."));
  return d;
}

/* Reads a recovery landing off the address bar, and returns null for
   anything that isn't one.

   Both halves come through the hash: a working session when the link is
   good, an error code when it has expired or has already been spent. The
   expired case carries no type=recovery, so the error code has to be
   recognised on its own — safe here because recovery is the only email
   link this app sends with a redirect (sign-up confirms with a 6-digit
   code, which never leaves the tab it was typed in). */
function readRecoveryHash() {
  try {
    const raw = (window.location.hash || "").replace(/^#/, "");
    if (!raw) return null;
    const h = new URLSearchParams(raw);
    const expired = h.get("error_code") === "otp_expired";
    if (h.get("type") !== "recovery" && !expired) return null;
    const err = h.get("error_description") || h.get("error");
    if (err) return { error: err };
    const token = h.get("access_token");
    if (!token) return null;
    return {
      token,
      refresh: h.get("refresh_token") || null,
      expiresIn: Number(h.get("expires_in")) || 0,
    };
  } catch { return null; }
}

/* Takes the tokens back out of the address bar. A recovery session sitting
   in browser history is worth as much as the password it can change. */
function clearAuthHash() {
  try {
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
  } catch {}
}

const AUTH_ICONS = [Footprints, Watch, Gem, Shirt, ShoppingBag, Droplets, Package, TrendingUp, Bookmark, Sparkles];

/* Brand mark. The R on its own — a chiselled bar, a blade for a stem, and
   a leg cut on the diagonal.

   Drawn as vector rather than placed as the supplied image. That artwork is
   a glossy black render on white: black is invisible on this app's ground,
   and the gloss turns to mud at the sizes this is actually looked at. One
   48px viewBox stays sharp in a browser tab, on a retina header and on a
   phone home screen, where a raster needs an export for each.

   Filled rather than stroked, because the character is in the changing
   weight — the bar thins to a point, the stem tapers — and a stroke has one
   width everywhere. The counter is open on the left rather than enclosed,
   which is what makes it this R and not an ordinary one. */
const R_MARK = [
  /* bar and bowl, one hook */
  "M7.2 9.8 L29.8 9.8 C35.4 9.8 38.8 13.1 38.8 17.7 C38.8 22.3 35.4 25.6 29.8 25.6 L21.3 25.6 L24.6 22.0 L29.2 22.0 C31.3 22.0 32.5 20.3 32.5 17.7 C32.5 15.1 31.3 15.7 29.2 15.7 L10.7 15.7 Z",
  /* the stem: wide at the shoulder, chiselled to a point */
  "M14.2 17.1 L21.5 17.1 L17.1 34.2 L9.7 38.9 Z",
  /* the leg */
  "M23.4 23.8 L31.0 23.8 L40.3 38.9 L34.1 38.9 Z",
];

/* The letter's own bounds inside that 48 box. Cropping to them is what lets
   the mark be set as a letter rather than placed as a picture: the box edges
   become the glyph edges, so its height is its cap height and its bottom is
   its baseline. */
const R_BOX = { x: 7.2, y: 9.8, w: 33.1, h: 29.1 };
const R_RATIO = R_BOX.w / R_BOX.h;

/* Monochrome, on currentColor, so it inherits whatever it sits on and is
   correct in all five themes without knowing any colour. */
function Logo({ size = 46, title = "Reamp" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      role="img" aria-label={title} style={{ display: "block" }}>
      <g fill="currentColor">
        {R_MARK.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

/* The wordmark, with the mark standing in for the letter it already is.

   Setting the mark beside the word spelt the R twice — once drawn, once
   typed — which is a lot of R for a five-letter name. This way the logo is
   present at full size and the name is still read in one go.

   Alignment is done by the text engine rather than by nudging: the svg is
   cropped to the glyph, so its height is its cap height and its bottom edge
   is its baseline, and it is laid out inline on that baseline. It therefore
   sits correctly at any size, not just the one it was eyeballed at. */

/* Archivo's capitals measure 0.765em at weight 800 — measured on a canvas
   rather than assumed, because the usual 0.7 guess left the mark a
   half-pixel short of the caps beside it. */
const CAP_RATIO = 0.765;

/* Two corrections, both optical rather than geometric.

   Sized dead level with the caps, the mark still read as floating above the
   line. That is because it comes to points at the bottom — the stem's
   chisel and the leg's corner — while E A M P sit flat on it. A pointed
   shape needs to cross the line to look like it is standing on it, which is
   the same reason O and V overshoot in any decent typeface.

   So the mark is set a touch larger than cap height and the extra is split
   evenly above and below, giving it presence without making it look like it
   is riding up out of the word. */
const MARK_SCALE = 1.045;

function Wordmark({ size = 16, accent = C.accent, title = "Reamp" }) {
  const cap = size * CAP_RATIO;
  const h = cap * MARK_SCALE;
  const overshoot = (h - cap) / 2;
  return (
    <span role="img" aria-label={title}
      /* Lowercase wants less negative tracking than caps do — at -0.03em the
         round letters started touching. */
      style={{ display: "inline-flex", alignItems: "baseline", whiteSpace: "nowrap",
        fontSize: size, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
      <svg aria-hidden="true" height={h} width={h * R_RATIO} fill="currentColor"
        viewBox={`${R_BOX.x} ${R_BOX.y} ${R_BOX.w} ${R_BOX.h}`}
        style={{ display: "inline-block", verticalAlign: "baseline",
          /* Moved with a transform rather than a negative bottom margin:
             Chrome synthesises a flex item's baseline from its border box,
             so the margin was silently ignored here and the glyph stayed
             pinned to the line. A transform shifts the paint without
             touching layout, which is exactly what an optical nudge is. */
          transform: `translateY(${overshoot}px)`,
          marginRight: size * 0.05 }}>
        {R_MARK.map((d) => <path key={d} d={d} />)}
      </svg>
      <span aria-hidden="true">eamp<span style={{ color: accent }}>.</span></span>
    </span>
  );
}

/* Password rules. Every one must pass before an account can be created —
   the strength bar is the visible half of exactly this list, so the meter
   and the gate can never disagree with each other. */
/* Supabase's one-time codes are six digits by default, but the length is a
   project setting that goes up to ten — and the app was refusing anything
   that was not exactly six, so raising that setting would silently break
   sign-up and password reset with no way to tell why from the screen.
   Accept the whole documented range instead of hard-coding today's value. */
const OTP_MIN = 6;
const OTP_MAX = 10;
const otpOk = (v) => v.length >= OTP_MIN && v.length <= OTP_MAX;

/* ── Has this password already been leaked? ─────────────────────────────

   Strength rules check a password's *shape*. "Password1!" satisfies every
   rule below and is one of the most breached strings in existence, because
   shape is not the same question as "is this already on a list someone is
   typing into login forms right now". That second question is the one that
   stops credential stuffing, and it needs real breach data.

   Supabase does this for you on the Pro plan. The data underneath is Have I
   Been Pwned, which is free and open, so this asks it directly.

   The password never leaves the browser. It is hashed with SHA-1, and only
   the first five characters of that hash are sent. HIBP replies with every
   leaked hash beginning with those five — several hundred of them — and the
   match is found locally. That is k-anonymity: the server cannot tell which
   of the candidates was being asked about, and never sees the password or
   even its full hash.

   SHA-1 is not a security choice here and is not protecting anything. It is
   the format HIBP's corpus is published in, and the only thing being
   compared is "is this exact string in that list".

   Returns the number of breaches it appeared in, 0 if clean, or null if the
   question could not be asked. Null is deliberately not "unsafe": if HIBP
   is down or the network is blocked, that is not the person's fault and
   they should not be locked out of signing up over it. */
const PWNED_API = "https://api.pwnedpasswords.com/range/";

async function pwnedCount(password) {
  try {
    if (!password || !globalThis.crypto?.subtle) return null;
    const bytes = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const prefix = hash.slice(0, 5), suffix = hash.slice(5);

    /* Add-Padding asks HIBP to pad the response with decoy rows, so the
       size of the reply cannot be used to narrow down the prefix. */
    const res = await fetch(PWNED_API + prefix, { headers: { "Add-Padding": "true" } });
    if (!res.ok) return null;

    for (const line of (await res.text()).split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

/* One sentence, used by both the sign-up screen and the reset screen, so a
   reset cannot be a quieter way past the same check. */
const pwnedMessage = (n) =>
  `That password has turned up in ${n === 1 ? "a known data breach" : `${n.toLocaleString()} known data breaches`}. It isn't about how it's spelled — attackers already have it on a list. Pick a different one.`;

const PW_RULES = [
  ["8+ characters",     (p) => p.length >= 8],
  ["Lowercase letter",  (p) => /[a-z]/.test(p)],
  ["Uppercase letter",  (p) => /[A-Z]/.test(p)],
  ["Number",            (p) => /\d/.test(p)],
  ["Special character", (p) => /[^A-Za-z0-9]/.test(p)],
];

/* Semantic colours, deliberately not the theme accent — red/amber/green
   have to mean weak/fair/strong in every palette, including the ones whose
   accent is already red. */
const PW_TONE = {
  weak:   { color: "#E1424A", label: "Weak",   pct: 33 },
  fair:   { color: "#D9932B", label: "Fair",   pct: 66 },
  strong: { color: "#1FA25C", label: "Strong", pct: 100 },
};

function passwordStrength(pw) {
  const met = PW_RULES.map(([label, test]) => ({ label, ok: test(pw) }));
  const n = met.filter((r) => r.ok).length;
  const level = n <= 2 ? "weak" : n <= 4 ? "fair" : "strong";
  return { met, n, level, ok: n === PW_RULES.length };
}

/* The reset screens sit under a centred mark and a centred line of copy, so
   their own text is centred too. Left-aligned prose under a centred header
   reads as an accident rather than a choice. Input labels are deliberately
   not included: a centred label over a left-aligned field looks broken. */
const resetHead = { fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8, textAlign: "center" };
const resetBody = { fontSize: 13, lineHeight: 1.55, textAlign: "center" };

function AuthScreen({ onDone, theme, recovery = null }) {
  const [mode, setMode]   = useState("login");   // login | signup
  /* A recovery link opens straight onto the reset screen. Nothing else on
     this page applies at that point — the person is holding a one-hour
     session and one job. */
  const [phase, setPhase] = useState(recovery ? "reset" : "form"); // form | verify | forgot | reset
  const [legal, setLegal] = useState(null); // null | "terms" | "privacy"
  const [email, setEmail] = useState("");
  const [loginWith, setLoginWith] = useState("email"); // email | username
  const [loginId, setLoginId] = useState("");          // whichever of the two they typed
  const [pw, setPw]       = useState("");
  const [code, setCode]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const [note, setNote]   = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent]   = useState(false);
  const [newPw, setNewPw]   = useState("");
  const [newPw2, setNewPw2] = useState("");

  const t = THEMES[theme] || THEMES.ivory;
  const strength = passwordStrength(pw);

  /* null = not asked yet, 0 = clean, n = breached. Checked live rather than
     only on submit, so someone finds out while they are still choosing
     rather than after committing to it. Only once the password already
     passes the shape rules — there is no point asking about half-typed
     ones, and it keeps the request count to roughly one per password. */
  const [pwned, setPwned] = useState(null);
  useEffect(() => {
    if (mode !== "signup" || !strength.ok) { setPwned(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const n = await pwnedCount(pw);
      if (alive) setPwned(n);
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [pw, mode, strength.ok]);
  const emailOk = /\S+@\S+\.\S+/.test(email);
  // Logging in only needs credentials that already exist; the rules gate
  // account creation, so an older weaker password can still sign in.
  const loginIdOk = loginWith === "email"
    ? /\S+@\S+\.\S+/.test(loginId)
    : loginId.trim().length >= 2;
  const ok = mode === "login"
    ? loginIdOk && pw.length >= 6
    : emailOk && strength.ok;

  const submit = async () => {
    // Spell out why rather than leaving a dead button. The strength gate is
    // the most likely reason someone is stuck here.
    if (!busy && mode === "signup" && emailOk && !strength.ok) {
      const missing = strength.met.filter((r) => !r.ok).map((r) => r.label.toLowerCase());
      setErr(`Password is too weak${strength.level === "fair" ? " — only fair" : ""}. Still needs ${missing.join(", ")}. Try again.`);
      return;
    }
    if (!ok || busy) return;

    /* The live check may not have run yet — fast typing, fast clicking — so
       ask here too before the account exists. `null` means the question
       could not be asked, and that is allowed through: a breach-list outage
       must not become a broken sign-up. */
    if (mode === "signup") {
      setBusy(true);
      const n = pwned ?? await pwnedCount(pw);
      setPwned(n);
      if (n > 0) { setBusy(false); setErr(pwnedMessage(n)); return; }
      setBusy(false);
    }

    setBusy(true); setErr(null); setNote(null);
    try {
      if (mode === "signup") {
        /* No username here any more. It is asked for on the next screen,
           once the account exists — three fields on a sign-up form loses
           people, and a name chosen before you have seen the product is a
           name chosen badly. profiles.username stays null until then, which
           is what PickUsername keys off. */
        const d = await supabaseAuth("signup", {
          email: cleanEmail(email),
          password: pw,
        });
        if (d.user && !d.access_token) {
          // No note here — the verify screen's own heading already says this,
          // and setting both printed the same sentence twice.
          setPhase("verify"); setCode("");
          setBusy(false); return;
        }
        onDone({ email: cleanEmail(email), provider: "email", ...sessionFields(d), id: d.user?.id });
      } else if (loginWith === "username") {
        // Supabase authenticates by email, so the username is resolved to an
        // account server-side by the username-login function.
        const res = await fetch(`${SUPABASE_URL}/functions/v1/username-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ username: loginId.trim(), password: pw }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.access_token) throw new Error(d.error || "Username or password is incorrect.");
        onDone({ email: d.user?.email || loginId.trim(), provider: "email", ...sessionFields(d), id: d.user?.id });
      } else {
        const addr = cleanEmail(loginId);
        const d = await supabaseAuth("token?grant_type=password", { email: addr, password: pw });
        onDone({ email: addr, provider: "email", ...sessionFields(d), id: d.user?.id });
      }
    } catch (e) {
      // Sandbox blocked the call, or the project isn't reachable from here.
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        setNote("Can't reach Supabase from this preview. Continuing in demo mode.");
        // The login tab writes to loginId and the sign-up tab to email. Sending
        // the wrong one here handed the app an identity with no address at all.
        const who = mode === "login" ? loginId.trim() : email.trim();
        setTimeout(() => onDone({ email: who, provider: "demo" }), 900);
      } else setErr(e.message);
    } finally { setBusy(false); }
  };

  /* Exchanges the emailed 6-digit code for a session. Supabase calls this
     token verification: type "signup" confirms the address and signs the
     new account in, in one step. */
  const verifyCode = async () => {
    const token = code.replace(/\D/g, "");
    if (!otpOk(token) || busy) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const d = await supabaseAuth("verify", { type: "signup", email, token });
      if (!d.access_token) { setErr("That code didn't work. Check it and try again."); return; }
      onDone({ email, provider: "email", ...sessionFields(d), id: d.user?.id });
    } catch (e) {
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        setNote("Can't reach Supabase from this preview. Continuing in demo mode.");
        setTimeout(() => onDone({ email, provider: "demo" }), 900);
      } else setErr(/expired|invalid/i.test(e.message)
        ? "That code is wrong or has expired. Send a new one."
        : e.message);
    } finally { setBusy(false); }
  };

  const resendCode = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      await supabaseAuth("resend", { type: "signup", email });
      setNote(`New code sent to ${email}.`);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  const resetStrength = passwordStrength(newPw);
  const resetMatches  = newPw.length > 0 && newPw === newPw2;
  const resetOk       = resetStrength.ok && resetMatches;
  const resetEmailOk  = /\S+@\S+\.\S+/.test(resetEmail.trim());

  const openForgot = () => {
    setErr(null); setNote(null); setResetSent(false);
    /* Carry over whatever is already typed, but only when it is an address.
       The login field also takes a username, and GoTrue has no way to mail
       one of those. */
    setResetEmail(/\S+@\S+\.\S+/.test(loginId.trim()) ? loginId.trim() : "");
    setPhase("forgot");
  };

  const backToLogin = () => {
    setErr(null); setNote(null); setResetSent(false);
    setNewPw(""); setNewPw2("");
    setMode("login"); setPhase("form");
  };

  const sendReset = async () => {
    if (!resetEmailOk || busy) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      await sendRecoveryEmail(cleanEmail(resetEmail));
      setResetSent(true);
    } catch (e) {
      // Unlike sign-in there is no demo path here: the email has to be sent
      // by a server that actually exists.
      setErr(/failed to fetch|networkerror|load failed/i.test(e.message)
        ? "Can't reach Supabase from this preview. Password reset only works on the live site."
        : e.message);
    } finally { setBusy(false); }
  };

  /* Spends the recovery session on a new password. On success the same
     session becomes the signed-in one, so a reset ends in the app rather
     than back at a login form asking for the password just set. */
  const applyReset = async () => {
    if (busy || !recovery?.token) return;
    if (!resetStrength.ok) {
      const missing = resetStrength.met.filter((r) => !r.ok).map((r) => r.label.toLowerCase());
      setErr(`Password is too weak. Still needs ${missing.join(", ")}.`);
      return;
    }
    if (!resetMatches) { setErr("The two passwords don't match."); return; }

    /* Same check as sign-up. A reset must not be the quiet way past it. */
    setBusy(true);
    const leaked = await pwnedCount(newPw);
    setBusy(false);
    if (leaked > 0) { setErr(pwnedMessage(leaked)); return; }

    setBusy(true); setErr(null); setNote(null);
    try {
      const u = await updatePassword(recovery.token, newPw);
      clearAuthHash();

      /* Always back to the login screen, never straight into the app.

         Typing the new password once proves it actually took, and it makes
         the reset end the same way every time — carrying the recovery
         session forward would end differently depending on whether the
         password change revoked it, which is a project setting rather than
         anything this code controls.

         The recovery session is dropped here rather than stored. It has
         done its one job. */
      setNewPw(""); setNewPw2("");
      setMode("login"); setPhase("form");
      setLoginWith("email");
      setLoginId(u.email || resetEmail.trim());
      setNote("Password changed. Log in with your new one.");
    } catch (e) {
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        setErr("Can't reach Supabase. Check your connection and try again.");
      } else if (/jwt|401|invalid token/i.test(e.message)) {
        setErr("This reset link has expired — they're good for one hour. Send yourself a new one.");
      } else setErr(e.message);
    } finally { setBusy(false); }
  };

  // Popup sign-in. The popup is its own top-level window, so it can complete
  // OAuth even when the app itself is inside a frame. It lands on the
  // auth-callback function, which posts the token back here.
  const google = () => {
    setErr(null); setNote(null);

    const w = window.open(googleAuthUrl(true), "supabase-oauth",
      "width=480,height=640,menubar=no,toolbar=no");

    if (!w) {
      setErr("Your browser blocked the popup. Allow popups for this page and try again.");
      return;
    }

    setBusy(true);
    setNote("Finish signing in with Google in the popup window…");

    const onMessage = async (ev) => {
      const d = ev.data;
      if (!d || d.type !== "supabase-auth") return;
      cleanup();
      if (d.error) { setErr(d.error); setBusy(false); return; }
      if (!d.access_token) { setErr("Google didn't return a session. Try again."); setBusy(false); return; }
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${d.access_token}` },
        });
        const u = await res.json();
        onDone({ email: u.email, provider: "google", ...sessionFields(d), id: u.id });
      } catch (e) {
        setErr("Signed in, but couldn't load your account. Try again.");
        setBusy(false);
      }
    };

    const timer = setInterval(() => {
      if (w.closed) { cleanup(); setBusy(false);
        setNote("Popup closed before sign-in finished."); }
    }, 700);

    const giveUp = setTimeout(() => {
      cleanup(); setBusy(false);
      setNote("Google sign-in timed out. If the popup completed but nothing happened, this preview frame is blocking the handoff — it will work once the app runs on your own domain.");
    }, 120000);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      clearInterval(timer); clearTimeout(giveUp);
      try { w.close(); } catch {}
    }

    window.addEventListener("message", onMessage);
  };

  return (
    <div className="reseller-root" style={{ minHeight: "100vh", background: t.void, color: t.bone, fontFamily: SANS, position: "relative", overflow: "hidden" }}>
      <Styles theme={theme} />
      <style>{`
        /* The 4% ramp is deliberate: on the 16-32s cycles below it lands
           between half a second and a second, so an icon is simply there
           rather than visibly arriving. */
        @keyframes drift {
          0%   { transform: translateY(0) rotate(0deg);      opacity: 0; }
          4%   { opacity: .13; }
          88%  { opacity: .13; }
          100% { transform: translateY(-120px) rotate(14deg); opacity: 0; }
        }
        @keyframes glow { 0%,100% { opacity:.5; transform:scale(1);} 50% { opacity:.85; transform:scale(1.08);} }
        @keyframes slideIn { from { opacity:0; transform:translateY(18px) scale(.98);} to { opacity:1; transform:none;} }
        @keyframes markIn { from { opacity:0; transform:translateY(7px) scale(.84);} to { opacity:1; transform:none;} }
        .auth-card { animation: slideIn .6s cubic-bezier(.2,.7,.3,1) both; }
        .auth-logo { animation: markIn .55s cubic-bezier(.2,.7,.3,1) .14s both; }
        /* Hover motion. Everything you can act on lifts slightly toward the
           cursor; the lift is small and fast enough to read as responsiveness
           rather than decoration. */
        .auth-in { transition: border-color .2s, box-shadow .2s, background .2s, transform .18s cubic-bezier(.2,.7,.3,1); }
        .auth-in:hover {
          transform: translateY(-2px);
          border-color: var(--c-accentText);
          box-shadow: var(--glow);
        }
        /* Declared after :hover so a focused field keeps the stronger ring
           even while the pointer is over it. */
        .auth-in:focus-within {
          border-color: var(--c-accentText) !important;
          box-shadow: var(--glow-focus);
          transform: translateY(-2px);
        }
        .auth-tab { transition: color .2s, transform .16s cubic-bezier(.2,.7,.3,1), text-shadow .2s; }
        .auth-tab:hover { transform: translateY(-1px); text-shadow: 0 0 14px color-mix(in srgb, var(--c-accent) 70%, transparent); }
        /* Hold the placeholder well back — at this size and tracking, mid-grey
           zeros read as a code that's already been typed. */
        .otp-in::placeholder { color: var(--c-dead); opacity: .38; }
        .pw-req { transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .2s; }
        .pw-req:hover {
          transform: translateY(-2px) scale(1.04);
          box-shadow: var(--glow);
        }
        .auth-link { transition: color .2s, transform .16s cubic-bezier(.2,.7,.3,1), text-shadow .2s; }
        .auth-link:hover {
          color: var(--c-accentText) !important; transform: translateY(-1px);
          text-shadow: 0 0 14px color-mix(in srgb, var(--c-accent) 65%, transparent);
        }
        /* On the svg, not .auth-logo — that element's markIn animation uses
           fill "both", which pins its transform and would beat a hover rule. */
        .auth-logo svg { transition: transform .22s cubic-bezier(.2,.7,.3,1), filter .22s; }
        .auth-logo:hover svg {
          transform: translateY(-3px) rotate(-4deg);
          filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c-accent) 70%, transparent));
        }
        .auth-cta { transition: transform .16s cubic-bezier(.2,.7,.3,1), box-shadow .22s, filter .2s; }
        .auth-cta:hover:not(:disabled) { transform: translateY(-2px); box-shadow: var(--glow); filter: brightness(1.06); }
        .auth-cta:active:not(:disabled) { transform: translateY(0) scale(.98); }
        .auth-alt { transition: border-color .2s, background .2s, transform .16s; }
        .auth-alt:hover {
          border-color: var(--c-accentText) !important; transform: translateY(-1px);
          box-shadow: var(--glow);
        }
        /* The card and the mark stop moving but stay fully visible. The .1
           opacity below is only meant for the ambient drifting icons —
           applying it to .auth-card too left the whole login form at 10%
           opacity for anyone browsing with reduced motion. */
        @media (prefers-reduced-motion: reduce) {
          .auth-card,.auth-logo { animation: none !important; }
          [data-drift] { animation: none !important; opacity: .1 !important; }
          /* Hover still gives feedback, just without the movement. */
          .auth-in,.auth-tab,.pw-req,.auth-link,.auth-cta,.auth-alt,.auth-logo svg { transition: none !important; }
          .auth-in:hover,.auth-tab:hover,.pw-req:hover,.auth-link:hover,
          .auth-cta:hover:not(:disabled),.auth-alt:hover,.auth-logo:hover svg { transform: none !important; }
        }
      `}</style>

      {/* ambient reselling icons, drifting slowly — motion is unhurried on purpose */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {AUTH_ICONS.map((Icon, i) => (
          <span key={i} data-drift style={{
            position: "absolute",
            left: `${[8,26,44,62,80,14,36,58,74,90][i]}%`,
            top: `${[72,88,64,92,70,30,14,26,44,8][i]}%`,
            /* Short stagger, not a queue. At the old 1.9s spacing the last
               icon didn't start until 17s in, so the screen looked empty on
               arrival and filled up one icon at a time. The varying cycle
               lengths above pull them out of step soon enough on their own. */
            animation: `drift ${16 + (i % 5) * 4}s linear ${i * 0.22}s infinite`,
            color: i % 3 === 0 ? t.accent : t.dim, opacity: 0,
          }}>
            <Icon size={[40,31,50,28,37,34,46,30,42,33][i]} strokeWidth={1.25} />
          </span>
        ))}
      </div>

      {/* Accent wash over the whole screen — three soft pools rather than one
          flat tint, so the colour has somewhere to fall off to and the ground
          keeps its depth. Static, so it survives reduced-motion untouched. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: [
          `radial-gradient(95% 62% at 50% -6%, ${t.accent}3A 0%, transparent 68%)`,
          `radial-gradient(70% 48% at 8% 104%, ${t.accent}24 0%, transparent 70%)`,
          `radial-gradient(76% 52% at 96% 88%, ${t.accent}1F 0%, transparent 72%)`,
        ].join(", "),
      }} />

      {/* soft glow behind the card */}
      <div aria-hidden="true" style={{
        position: "absolute", left: "50%", top: "38%", width: 620, height: 620,
        transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none",
        background: `radial-gradient(circle, ${t.accent}3D 0%, transparent 68%)`,
        animation: "glow 7s ease-in-out infinite",
      }} />

      <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
        <div className="auth-card" style={{ width: "100%", maxWidth: 400 }}>

          <div style={{ textAlign: "center", marginBottom: 30 }}>
            {/* The mark alone. It still carries the name for anything that
                reads the page aloud — Logo sets aria-label — so dropping the
                typed word costs nothing but the second telling of it. */}
            <div className="auth-logo" style={{ display: "flex", justifyContent: "center", marginBottom: 16, color: t.bone }}>
              <Logo size={52} />
            </div>
            <div style={{ fontSize: 12.5, color: t.dim, letterSpacing: "0.02em" }}>
              {phase === "reset" ? "Let's get you back in"
                : phase === "forgot" ? "It happens"
                : mode === "login" ? "Welcome back"
                : "Start tracking what actually sells"}
            </div>
          </div>

          <div style={{ background: t.panel, border: `1px solid ${t.line}`, borderRadius: 26, padding: 24, boxShadow: "0 24px 60px -24px rgba(0,0,0,.7)" }}>

            {phase === "verify" ? (
              /* Code screen. Replaces the whole card rather than sitting under
                 it, so there is exactly one thing to do at this point. */
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
                  Check your email
                </div>
                <p style={{ fontSize: 13, color: t.dim, lineHeight: 1.55, margin: "0 0 20px" }}>
                  We sent a 6-digit code to <span style={{ color: t.bone, fontWeight: 700 }}>{email}</span>.
                  Enter it below to finish creating your account.
                </p>

                <div className="auth-in" style={{ background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px", marginBottom: 14 }}>
                  <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_MAX}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_MAX))}
                    onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                    placeholder="000000" aria-label="6-digit verification code" className="otp-in"
                    style={{ width: "100%", background: "none", border: "none", outline: "none",
                      color: t.bone, fontFamily: MONO, fontSize: 26, fontWeight: 700,
                      letterSpacing: "0.34em", textAlign: "center", padding: "16px 0" }} />
                </div>

                {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accentText, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
                {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

                <button onClick={verifyCode} disabled={!otpOk(code) || busy} className="auth-cta"
                  style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                    cursor: otpOk(code) && !busy ? "pointer" : "not-allowed",
                    fontFamily: SANS, fontSize: 15, fontWeight: 800,
                    background: otpOk(code) ? t.accent : t.raised,
                    color: otpOk(code) ? t.onAccent : t.dead }}>
                  {busy ? "Checking…" : "Verify and continue"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
                  <button onClick={resendCode} disabled={busy} className="auth-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: SANS, fontSize: 12, fontWeight: 600, color: t.dim }}>
                    Send a new code
                  </button>
                  <button onClick={() => { setPhase("form"); setErr(null); setNote(null); }} className="auth-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: SANS, fontSize: 12, fontWeight: 600, color: t.dim }}>
                    Use a different email
                  </button>
                </div>
              </div>
            ) : phase === "forgot" ? (
              /* Ask for the address, then stop. Like the code screen, this
                 replaces the card rather than sitting under it. */
              <div>
                <div style={resetHead}>
                  {resetSent ? "Check your email" : "Reset your password"}
                </div>

                {resetSent ? (
                  <>
                    {/* Deliberately hedged. Confirming that an address has an
                        account would let anyone test addresses from this form. */}
                    <p style={{ ...resetBody, color: t.dim, margin: "0 0 20px" }}>
                      If an account exists for <span style={{ color: t.bone, fontWeight: 700 }}>{resetEmail.trim()}</span>,
                      a password reset link is on its way. Open the email and follow
                      the link to set a new password. It's good for one hour and
                      works once.
                    </p>
                    <p style={{ ...resetBody, fontSize: 12, color: t.dead, margin: "0 0 20px" }}>
                      Nothing after a couple of minutes? Check the spam folder, then send another.
                    </p>

                    {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accentText, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
                    {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

                    <button onClick={sendReset} disabled={busy} className="auth-cta"
                      style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                        cursor: busy ? "wait" : "pointer", fontFamily: SANS, fontSize: 15,
                        fontWeight: 800, background: t.accent, color: t.onAccent }}>
                      {busy ? "Sending…" : "Resend email"}
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ ...resetBody, color: t.dim, margin: "0 0 20px" }}>
                      Type the email address on your account and we'll send you a link
                      that lets you set a new password.
                    </p>

                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>Email</div>
                    <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px", marginBottom: 16 }}>
                      <input type="email" value={resetEmail} autoFocus
                        onChange={(e) => setResetEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendReset()}
                        placeholder="you@email.com" autoComplete="email" aria-label="Email address"
                        style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                    </div>

                    {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accentText, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
                    {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

                    <button onClick={sendReset} disabled={!resetEmailOk || busy} className="auth-cta"
                      style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                        cursor: resetEmailOk && !busy ? "pointer" : "not-allowed",
                        fontFamily: SANS, fontSize: 15, fontWeight: 800,
                        background: resetEmailOk ? t.accent : t.raised,
                        color: resetEmailOk ? t.onAccent : t.dead }}>
                      {busy ? "Sending…" : "Send reset link"}
                    </button>
                  </>
                )}

                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button onClick={backToLogin} className="auth-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: SANS, fontSize: 12, fontWeight: 600, color: t.dim }}>
                    Back to log in
                  </button>
                </div>
              </div>
            ) : phase === "reset" ? (
              /* Landed from the emailed link. Either a live one-hour session
                 arrived in the hash, or the link was stale and all we have is
                 the reason why. */
              <div>
                {recovery?.error ? (
                  <>
                    <div style={resetHead}>
                      This link has expired
                    </div>
                    <p style={{ ...resetBody, color: t.dim, margin: "0 0 20px" }}>
                      Reset links last one hour and work once. Send yourself a fresh one
                      and open it straight away.
                    </p>
                    <button onClick={() => { clearAuthHash(); openForgot(); }} className="auth-cta"
                      style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", cursor: "pointer",
                        fontFamily: SANS, fontSize: 15, fontWeight: 800, background: t.accent, color: t.onAccent }}>
                      Send a new link
                    </button>
                  </>
                ) : (
                  <>
                    <div style={resetHead}>
                      Set a new password
                    </div>
                    <p style={{ ...resetBody, color: t.dim, margin: "0 0 20px" }}>
                      Pick something you haven't used here before. You'll log in
                      with it on the next screen.
                    </p>

                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>New password</div>
                    <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px", marginBottom: 14 }}>
                      <input type="password" value={newPw} autoFocus autoComplete="new-password"
                        onChange={(e) => setNewPw(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyReset()}
                        placeholder="Make it a strong one" aria-label="New password"
                        style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                    </div>

                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>Confirm password</div>
                    <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px", marginBottom: 14 }}>
                      <input type="password" value={newPw2} autoComplete="new-password"
                        onChange={(e) => setNewPw2(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyReset()}
                        placeholder="Type it once more" aria-label="Confirm new password"
                        style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                    </div>

                    {/* Same rules and the same meter as sign-up, on purpose —
                        a reset must not be a way around the password policy. */}
                    {newPw.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.dim }}>
                            Strength
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: PW_TONE[resetStrength.level].color }}>
                            {PW_TONE[resetStrength.level].label}
                          </span>
                        </div>
                        <div role="progressbar" aria-valuenow={resetStrength.n} aria-valuemin={0} aria-valuemax={PW_RULES.length}
                          aria-label="Password strength"
                          style={{ height: 6, borderRadius: 999, background: t.raised, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${PW_TONE[resetStrength.level].pct}%`,
                            background: PW_TONE[resetStrength.level].color, borderRadius: 999,
                            transition: "width .3s cubic-bezier(.2,.7,.3,1), background .3s",
                          }} />
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                          {resetStrength.met.map((r) => (
                            <span key={r.label} className="pw-req" style={{
                              fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 999,
                              border: `1px solid ${r.ok ? PW_TONE.strong.color : t.line}`,
                              color: r.ok ? PW_TONE.strong.color : t.dead,
                              display: "inline-flex", alignItems: "center", gap: 5,
                            }}>
                              {r.ok ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
                              {r.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reserved line, so the button doesn't jump when the
                        mismatch appears mid-typing. */}
                    <div style={{ height: 16, fontSize: 11, marginBottom: 6,
                      color: newPw2.length > 0 && !resetMatches ? t.accent : "transparent" }}>
                      Both passwords have to match
                    </div>

                    {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accentText, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
                    {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

                    <button onClick={applyReset} disabled={!resetOk || busy} className="auth-cta"
                      style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                        cursor: resetOk && !busy ? "pointer" : "not-allowed",
                        fontFamily: SANS, fontSize: 15, fontWeight: 800,
                        background: resetOk ? t.accent : t.raised,
                        color: resetOk ? t.onAccent : t.dead }}>
                      {busy ? "Saving…" : "Save new password"}
                    </button>
                  </>
                )}

                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button onClick={() => { clearAuthHash(); backToLogin(); }} className="auth-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                      fontFamily: SANS, fontSize: 12, fontWeight: 600, color: t.dim }}>
                    Back to log in
                  </button>
                </div>
              </div>
            ) : (
            <>

            {/* tabs */}
            <div style={{ display: "flex", background: t.raised, borderRadius: 999, padding: 4, marginBottom: 22, position: "relative" }}>
              <div style={{ position: "absolute", top: 4, bottom: 4, width: "calc(50% - 4px)",
                left: mode === "login" ? 4 : "50%", background: t.accent, borderRadius: 999,
                transition: "left .28s cubic-bezier(.2,.7,.3,1)" }} />
              {[["login","Log in"],["signup","Sign up"]].map(([k,l]) => (
                <button key={k} onClick={() => { setMode(k); setErr(null); setNote(null); }} className="auth-tab"
                  style={{ flex: 1, position: "relative", zIndex: 1, background: "none", border: "none",
                    padding: "10px 0", cursor: "pointer", fontFamily: SANS, fontSize: 13.5,
                    fontWeight: 700, color: mode === k ? t.onAccent : t.dim }}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              {mode === "login" ? (
                /* Pick which credential you're typing. The label is the
                   control — two words, the active one lit. */
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <button type="button" onClick={() => { setLoginWith("email"); setErr(null); }} className="auth-link"
                    aria-pressed={loginWith === "email"}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      color: loginWith === "email" ? t.accent : t.dead }}>
                    Email
                  </button>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: t.line }}>/</span>
                  <button type="button" onClick={() => { setLoginWith("username"); setErr(null); }} className="auth-link"
                    aria-pressed={loginWith === "username"}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      color: loginWith === "username" ? t.accent : t.dead }}>
                    Username
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>Email</div>
              )}

              <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px" }}>
                {mode === "login" ? (
                  <input key={loginWith}
                    type={loginWith === "email" ? "email" : "text"}
                    value={loginId} onChange={(e) => setLoginId(e.target.value)}
                    placeholder={loginWith === "email" ? "you@email.com" : "Your username"}
                    autoComplete={loginWith === "email" ? "email" : "username"}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                ) : (
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email"
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                )}
              </div>
            </div>

            <div style={{ marginBottom: mode === "signup" ? 14 : 6 }}>
              {/* The label row carries the way out. Same type size on both
                  sides, so adding the link doesn't move the field below it. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim }}>Password</span>
                {mode === "login" && (
                  <button type="button" onClick={openForgot} className="auth-link"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dead }}>
                    Forgot?
                  </button>
                )}
              </div>
              <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px" }}>
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                  placeholder={mode === "signup" ? "Make it a strong one" : "Your password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
              </div>
            </div>

            {/* Strength meter. Only on sign-up — on the login tab the rules
                don't apply and a red bar over an old password is just noise. */}
            {mode === "signup" && pw.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: t.dim }}>
                    Strength
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: PW_TONE[strength.level].color }}>
                    {PW_TONE[strength.level].label}
                  </span>
                </div>
                <div role="progressbar" aria-valuenow={strength.n} aria-valuemin={0} aria-valuemax={PW_RULES.length}
                  aria-label="Password strength"
                  style={{ height: 6, borderRadius: 999, background: t.raised, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${PW_TONE[strength.level].pct}%`,
                    background: PW_TONE[strength.level].color, borderRadius: 999,
                    transition: "width .3s cubic-bezier(.2,.7,.3,1), background .3s",
                  }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {strength.met.map((r) => (
                    <span key={r.label} className="pw-req" style={{
                      fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 999,
                      border: `1px solid ${r.ok ? PW_TONE.strong.color : t.line}`,
                      color: r.ok ? PW_TONE.strong.color : t.dead,
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}>
                      {r.ok ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
                      {r.label}
                    </span>
                  ))}
                </div>

                {/* The rules above are all green by the time this can show,
                    which is the point: a password can satisfy every one of
                    them and still be on a list someone is working through. */}
                {pwned > 0 && (
                  <div role="alert" style={{
                    marginTop: 10, padding: "9px 12px", borderRadius: 12,
                    background: t.raised, border: `1px solid ${PW_TONE.weak.color}`,
                    fontSize: 11.5, lineHeight: 1.5, color: t.bone,
                  }}>
                    <strong style={{ color: PW_TONE.weak.color }}>Found in a data breach.</strong>{" "}
                    This one has leaked {pwned === 1 ? "once" : `${pwned.toLocaleString()} times`} — attackers
                    already have it. Choose something else.
                  </div>
                )}
              </div>
            )}

            {mode === "login" && (
              <div style={{ height: 16, fontSize: 11, color: pw && pw.length < 6 ? t.accent : "transparent", marginBottom: 6 }}>
                Password needs at least 6 characters
              </div>
            )}

            {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accentText, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
            {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

            <button onClick={submit} disabled={busy} className="auth-cta"
              style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                cursor: busy ? "not-allowed" : "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 800,
                background: ok ? t.accent : t.raised, color: ok ? t.onAccent : t.dead }}>
              {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
            </button>

            {/* Shown before the account exists, not buried in Settings
                afterwards — agreeing to something you were never offered is
                not agreement. */}
            {mode === "signup" && (
              <p style={{ fontSize: 11, lineHeight: 1.55, color: t.dead, textAlign: "center", margin: "12px 0 0" }}>
                By creating an account you agree to our{" "}
                <button onClick={() => setLegal("terms")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: t.accentText, fontSize: 11, fontWeight: 600, textDecoration: "underline", fontFamily: SANS }}>
                  Terms
                </button>{" "}and{" "}
                <button onClick={() => setLegal("privacy")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                    color: t.accentText, fontSize: 11, fontWeight: 600, textDecoration: "underline", fontFamily: SANS }}>
                  Privacy Policy
                </button>.
              </p>
            )}

            {GOOGLE_SIGN_IN && (
            <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: t.line }} />
              <span style={{ fontSize: 10.5, color: t.dead, letterSpacing: "0.1em" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: t.line }} />
            </div>

            <button onClick={google} className="auth-alt"
              style={{ width: "100%", padding: "14px", borderRadius: 14, cursor: "pointer",
                background: "transparent", color: t.bone, border: `1px solid ${t.line}`,
                fontFamily: SANS, fontSize: 14, fontWeight: 600, display: "flex",
                alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ width: 17, height: 17, borderRadius: 999, background: t.bone, color: t.void,
                fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>G</span>
              Continue with Google
            </button>
            <p style={{ fontSize: 10.5, color: t.dead, textAlign: "center", marginTop: 9, lineHeight: 1.5 }}>
              Opens a popup — allow popups if your browser blocks it
            </p>
            </>
            )}
            </>
            )}
          </div>

          {GOOGLE_SIGN_IN && (
          <p style={{ fontSize: 11, color: t.dead, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
            Google needs your deployed domain to redirect back.
          </p>
          )}
        </div>
      </div>

      {legal && <LegalSheet which={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Picking a username, after the account exists rather than before.

   Sign-up used to ask for three things. It now asks for two, and this
   screen asks for the third once the person is already through the door
   and far likelier to finish. It is also the shape Google sign-in needs
   later: an OAuth provider hands over an email and a display name but
   never a username, so whatever route someone arrives by, they end up
   here exactly once.

   The database is the only authority on whether this screen is needed —
   `profiles.username` being empty. Asking the session instead looked
   tempting and was wrong: signing in by email stores no username, so
   every returning customer would have been asked to choose one again.

   Usernames are unique, so two people can pick the same one moments
   apart. The check below is a courtesy that makes the common case
   pleasant; the unique index is what actually guarantees it, and a 409
   coming back is handled as "taken" rather than as a crash.
   ────────────────────────────────────────────────────────────── */
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

/* A first guess from the email, so most people can press the button
   without typing. Stripped to the legal character set and padded if the
   result is too short to be valid. */
const suggestUsername = (email) => {
  const base = String(email || "").split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  return base.length >= 3 ? base : "";
};

function PickUsername({ email, userId, onDone }) {
  const [name, setName] = useState(() => suggestUsername(email));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const valid = USERNAME_RE.test(name.trim());

  const save = async () => {
    const want = name.trim();
    if (!valid || busy) return;
    setBusy(true); setErr(null);

    /* A demo session has no account behind it, so there is nothing to
       write. Let it through rather than blocking on a database that was
       never going to answer. */
    if (!userId) { onDone(want); return; }

    try {
      const taken = await sbRest(
        `profiles?select=id&username=ilike.${encodeURIComponent(want)}&limit=1`);
      const owner = Array.isArray(taken) && taken.length ? taken[0].id : null;
      if (owner && owner !== userId) {
        setErr("That username is taken. Try another.");
        setBusy(false); return;
      }
      if (owner === userId) { onDone(want); return; }
      await sbRest(`profiles?id=eq.${userId}`,
        { method: "PATCH", prefer: "return=minimal", body: { username: want } });
      onDone(want);
    } catch (e) {
      /* 23505 is Postgres for "unique violation" — somebody took it in the
         moment between the check and the write. Worth its own message,
         because "try again" would be wrong advice. */
      const msg = String(e?.message || e);
      setErr(/23505|duplicate|conflict/i.test(msg)
        ? "That username was just taken. Try another."
        : "Couldn't save that. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="reseller-root" style={{ minHeight: "100vh", background: C.void, color: C.bone, fontFamily: SANS }}>
      <Styles theme="obsidian" />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px", minHeight: "100vh",
        display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div key="pu" className="rise">
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.035em", margin: 0 }}>
            Pick a username
          </h2>
          <p style={{ fontSize: 14, color: C.dim, margin: "10px 0 24px", lineHeight: 1.6 }}>
            It's what we'll call you, and you can sign in with it instead of your email.
          </p>

          <div className="auth-in" style={{ display: "flex", alignItems: "center", background: C.raised,
            border: `1px solid ${err ? C.accent : C.line}`, borderRadius: 14, padding: "0 16px" }}>
            <input type="text" value={name} autoFocus autoComplete="username" maxLength={20}
              aria-label="Username"
              onChange={(e) => { setName(e.target.value); setErr(null); }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="yourname"
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.bone,
                fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
          </div>

          <p role={err ? "alert" : undefined}
            style={{ fontSize: 12, color: err ? C.accentText : C.dead, margin: "10px 0 0", lineHeight: 1.6 }}>
            {err || "3–20 characters. Letters, numbers, underscores and hyphens."}
          </p>
        </div>

        <button disabled={!valid || busy} onClick={save} className={valid && !busy ? "fx fx-accent" : ""}
          style={{ marginTop: 26, padding: "16px", borderRadius: 999, border: "none", fontSize: 14.5,
            fontWeight: 800, cursor: valid && !busy ? "pointer" : "not-allowed",
            background: valid && !busy ? C.accent : C.raised, color: valid && !busy ? C.onAccent : C.dead }}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function Onboard({ onDone }) {
 const [state, setState] = useState("");
 const [zip, setZip] = useState("");
 const [radius, setRadius] = useState(25);
 const ok = !!state;
 return (
 <div className="reseller-root" style={{ minHeight: "100vh", background: C.void, color: C.bone, fontFamily: SANS }}>
 <Styles theme="obsidian" />
 <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
 <div key="ob" className="rise">
 <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.035em", margin: 0 }}>
 Where are you located?
 </h2>
 <p style={{ fontSize: 14, color: C.dim, margin: "10px 0 24px" }}>
 Used for local opportunities only. You can change this anytime.
 </p>
 <div style={{ display: "flex", gap: 8 }}>
 <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State"
 style={{ ...inputSt, flex: 1 }}>
 <option value="">State</option>{STATES.map((s) => <option key={s}>{s}</option>)}
 </select>
 <input value={zip} inputMode="numeric" maxLength={5} placeholder="ZIP" aria-label="ZIP"
 onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
 style={{ ...inputSt, flex: 1, fontFamily: MONO }} />
 </div>
 <div style={{ marginTop: 18 }}>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 9 }}>
 <span style={{ color: C.dim }}>Search radius</span>
 <span style={{ fontFamily: MONO, color: C.accentText, fontWeight: 600 }}>{radius} mi</span>
 </div>
 <input type="range" min={5} max={100} step={5} value={radius} aria-label="Radius"
 onChange={(e) => setRadius(+e.target.value)} style={{ width: "100%", accentColor: C.accent }} />
 </div>
 </div>
 <button disabled={!ok} onClick={() => onDone({ state, zip, radius })} className={ok ? "fx fx-accent" : ""}
 style={{ marginTop: 30, padding: "16px", borderRadius: 999, border: "none", fontSize: 14.5, fontWeight: 800, cursor: ok ? "pointer" : "not-allowed", background: ok ? C.accent : C.raised, color: ok ? C.onAccent : C.dead }}>
 Show me opportunities
 </button>
 </div>
 </div>
 );
}

export default function ResellOS() {
 const [stage, setStage] = useState("auth"); // auth | app
 const [tab, setTab] = useState("home");
 const [jump, setJump] = useState(null);
 const [user, setUser] = useState(null);

 /* Which account's data to load. Falls back to the email for sessions minted
    before the id was stored, so an older session does not read as a new
    empty account. Null when signed out, which empties the store. */
 const scope = user?.id || user?.email || null;
 /* The database needs the real account id; the local cache can fall back to
    an email for sessions minted before ids were stored. */
 const { db, ready, put, reset, syncError } = useStore(scope, user?.id || null);
 /* Set when the address bar says we arrived from a reset email. It outranks
    a stored session: someone who can't remember their password is not helped
    by being silently signed in as whoever used this browser last.

    Read here rather than in the effect below so the token is captured before
    anything else can look at the hash — the effect then wipes the address bar
    immediately, and this state is the only copy that survives. */
 const [recovery, setRecovery] = useState(() => readRecoveryHash());
 /* Starts free and stays free until the server says otherwise. Nothing in
    the browser can change this to "pro" — it is only ever the answer that
    came back from the entitlements table. */
 const [ent, setEnt] = useState({ plan: "free", expiresAt: null });
 const [entLoading, setEntLoading] = useState(false);
 /* What the last check actually found, in words. Without it the button has
    no way to report anything and looks broken when it is working. */
 const [entNote, setEntNote] = useState(null);
 const isPro = ent.plan === "pro";

 /* Re-read the plan. Called after sign-in, and by the "I've paid" button in
    Settings so someone who has just been activated does not have to guess
    when to reload. */
 const refreshEntitlement = async () => {
   setEntLoading(true); setEntNote(null);
   try {
     /* Renew the token first. This button exists precisely because a plan
        was changed on the server after this browser signed in, so the
        stored token is the one thing most likely to be out of date. */
     const e = await fetchEntitlement({ force: true });
     setEnt(e);
     setEntNote(
       e.error ? e.error
       : e.plan === "pro" ? "Premium is active on this account."
       : "This account is still on the free plan. If you have just been upgraded, sign out and back in, then check again."
     );
   } finally { setEntLoading(false); }
 };

 /* Which locked feature was just reached for, or null. One piece of state
    for all three, because only one dialog can be on screen anyway. */
 const [locked, setLocked] = useState(null);

 /* The single question every locked thing asks. Returns true to proceed,
    or opens the dialog and returns false — so the caller reads as
    "if (!requirePro('x')) return;" and the decision lives in one place
    rather than three copies of the same conditional. */
 const requirePro = (feature) => {
   if (isPro) return true;
   setLocked(feature);
   return false;
 };

 const [aiOpen, setAiOpen] = useState(false);
 const [range, setRange] = useState("30");
 const biz = useBusiness(db, range);

 useEffect(() => {
 (async () => {
   /* Back from a reset email? That hash also carries an access_token, so it
      has to be handled before the Google branch below claims it — that
      branch would sign the person straight in and skip the reset entirely.
      Returning here leaves any stored session unread, which is what puts
      the reset screen in front of everything else.

      The hash goes now, not after the password is saved. A recovery session
      left in the address bar is worth as much as the password it can change,
      and it would otherwise survive in history, in a shared screen, or in
      whatever the next thing to read location.hash happens to be. */
   if (recovery) { clearAuthHash(); setStage("auth"); return; }

   // Coming back from Google? The implicit flow puts tokens in the hash.
   try {
     const h = window.location.hash || "";
     if (h.includes("access_token=")) {
       const hash = new URLSearchParams(h.slice(1));
       const token = hash.get("access_token");
       /* The implicit flow hands back a refresh token and a lifetime
          alongside the access token. Keeping them is what lets a Google
          session survive its first hour. */
       const refresh = hash.get("refresh_token");
       const expiresIn = Number(hash.get("expires_in"));
       if (token) {
         const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
           headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
         });
         if (res.ok) {
           const u = await res.json();
           const profile = { email: u.email, provider: "google", token, id: u.id,
             refresh: refresh || null,
             expiresAt: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null };
           setUser(profile); setStage("app");
           try { await window.storage.set("ros:session", JSON.stringify(profile)); } catch {}
           // strip the tokens out of the address bar
           window.history.replaceState({}, "", window.location.pathname + window.location.search);
           return;
         }
       }
     }
   } catch { /* fall through to the stored session */ }
   try { const a = await window.storage.get("ros:session"); if (a) { setUser(JSON.parse(a.value)); setStage("app"); } } catch {}
 })();
 }, []);

 /* The effect above only runs on a page load, and a reset link doesn't
    always arrive as one: pasting it into the tab that already has the app
    open changes nothing but the hash, which the browser treats as a
    same-document navigation. Without this, that link would appear to do
    nothing at all.

    Dropping the user is intentional. Whoever is signed in here is not
    necessarily the account the link belongs to, and a password reset should
    never be applied to a session that happens to be lying around. */
 useEffect(() => {
   const onHashChange = () => {
     const rec = readRecoveryHash();
     if (!rec) return;
     clearAuthHash();
     setRecovery(rec);
     setUser(null);
     setStage("auth");
   };
   window.addEventListener("hashchange", onHashChange);
   return () => window.removeEventListener("hashchange", onHashChange);
 }, []);

 const go = (t, payload = null) => { setJump(payload); setTab(t); };

 // Clears the session and returns to the login screen, so the whole flow
 // can be walked again from the top.
 //
 // All three updates run before the await, so React batches them into one
 // render that shows the login screen. Awaiting first would flush
 // setUser(null) on its own and re-render the app header — which reads
 // user.email — against a null user, blanking the screen.
 const signOut = async () => {
   /* Read the token before anything clears it. Straight from storage rather
      than through sessionToken(), which would try to renew a session we are
      about to throw away. */
   let token = null;
   try {
     const a = await window.storage.get("ros:session");
     if (a) token = JSON.parse(a.value)?.token || null;
   } catch {}

   setStage("auth");
   setUser(null);
   setTab("home");
   try { await window.storage.delete("ros:session"); } catch {}

   /* Then tell Supabase. Deleting the local copy only hides the session from
      this browser — the refresh token stays valid on the server until it is
      revoked, so a sign-out that never reaches Supabase leaves a working
      credential behind it. Not awaited: as far as this device is concerned
      the person is already signed out, and a slow network should not hold
      the screen. */
   if (token) {
     fetch(`${SUPABASE_URL}/auth/v1/logout`, {
       method: "POST",
       headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
     }).catch(() => {});
   }
 };
 /* Tied to the user, so signing out drops back to free immediately rather
    than leaving the previous person's plan on screen. */
 useEffect(() => {
   /* Kept current for openCheckout, which needs it synchronously inside a
      click handler and cannot go and look it up. */
   checkoutUserId = user?.id || null;
   if (!user) { setEnt({ plan: "free", expiresAt: null }); return; }
   let alive = true;
   fetchEntitlement().then((e) => alive && setEnt(e));
   return () => { alive = false; };
 }, [user]);

 /* Checkout opens in another tab. Coming back to this one is the moment the
    payment has most likely just landed, so that is when to ask again —
    otherwise somebody pays, returns, still sees Free, and concludes it did
    not work. The webhook has usually written the row within a second or
    two; the manual button remains for the times it has not. */
 useEffect(() => {
   if (!user) return;
   const recheck = () => {
     if (document.visibilityState !== "visible") return;
     fetchEntitlement({ force: true }).then((e) => {
       /* Only ever promotes. A failed check must not knock a paying
          customer down to Free because their connection blinked. */
       if (e.plan === "pro") setEnt(e);
     });
   };
   document.addEventListener("visibilitychange", recheck);
   return () => document.removeEventListener("visibilitychange", recheck);
 }, [user]);

 const theme = db.profile.theme || "obsidian";
 /* Whatever we can call this person. Indexing straight into user.email
    crashed the whole app to a blank screen when a sign-in produced a session
    with no address on it — a label is never worth taking the UI down for. */
 const who = displayName(user, db.profile) || "Signed in";

 if (!ready) return <div style={{ minHeight: "100vh", background: THEMES.ivory.void }} />;

 // `|| !user` is a backstop: everything below this line reads user.email, so
 // a null user must never reach it, however the state got that way.
 if (stage === "auth" || !user) return (
 <AuthScreen key={recovery ? "recovery" : "auth"} theme={theme} recovery={recovery} onDone={async (p) => {
 setRecovery(null);
 setUser(p); try { await window.storage.set("ros:session", JSON.stringify(p)); } catch {}
 setStage("app");
 }} />
 );

 /* Before onboarding, because a username is the one thing the app cannot
    work around: username sign-in needs it, and it is how the person is
    addressed everywhere. Gated on the profile loaded from the database,
    so nobody who already has one is asked twice. */
 if (!db.profile.username && !user?.username) {
 return <PickUsername email={user?.email} userId={user?.id || null}
   onDone={(username) => {
     put("profile", { ...db.profile, username });
     /* Mirrored onto the session so the greeting and the header pick it
        up straight away, rather than after the next reload. */
     setUser((u) => (u ? { ...u, username } : u));
   }} />;
 }

 if (!db.profile.onboarded) {
 return <Onboard onDone={(loc) => put("profile", { ...db.profile, ...loc, onboarded: true })} />;
 }

 const TABS = [
 ["home", "Home", HomeIcon], ["discover", "Discover", Compass],
 ["saturation", "Saturation", Layers], ["business", "Business", Briefcase],
 ["settings", "Settings", SettingsIcon],
 ];

 return (
 <div className="reseller-root" style={{ minHeight: "100vh", background: C.void, color: C.bone, fontFamily: SANS }}>
 <Styles theme={theme} />
 {/* Said plainly rather than silently. A change that has not reached the
     server is not lost — it is on this device — but the person is entitled
     to know before they close the tab on a phone with no signal. */}
 {syncError && (
 <div role="status" style={{ padding: "10px 16px", background: C.raised,
 borderBottom: `1px solid ${C.line}`, fontSize: 12, lineHeight: 1.5, color: C.dim, textAlign: "center" }}>
 {syncError}
 </div>
 )}
 {/* The bottom padding was a 104px strip reserved for the fixed tab bar.
     With the bar gone it exists only to keep the last row of content clear
     of the assistant button — which the old 104px did not manage, so the
     Net profit figure was sitting underneath it. The button occupies 78px
     up from the bottom edge; this leaves a margin on top of that. */}
 <div className="shell" style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(132px + env(safe-area-inset-bottom, 0px))" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, paddingBottom: 14 }}>
 {/* This row is the one piece of chrome on every tab, so it is where the
     logo is always seen and never in the way of anything. */}
 <span style={{ color: C.bone, display: "flex" }}>
 <Wordmark size={17} accent={C.accent} />
 </span>
 <button onClick={signOut} className="fx fx-chip" title={`Signed in as ${who} — tap to sign out`}
 style={{ display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 13px 5px 5px", cursor: "pointer", fontFamily: SANS, fontSize: 12, color: C.dim }}>
 <span style={{ width: 22, height: 22, borderRadius: 999, background: C.accent, color: C.onAccent, fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>
 {who.charAt(0).toUpperCase()}
 </span>
 Sign out
 </button>
 </div>

 {/* Desktop tab row. It lives in the shell rather than inside HomeScreen
     so it sits in the same place on every tab — a nav that only existed
     on Home would be a nav you could walk away from and not get back to.
     On Home that puts it directly above the range filter. */}
 <nav className="topnav" aria-label="Sections"
   style={{ gap: 26, alignItems: "center", borderBottom: `1px solid ${C.line}`, marginBottom: 20 }}>
 {TABS.map(([k, name, Icon]) => {
 const on = tab === k;
 return (
 <button key={k} onClick={() => go(k)} className="topnav-link"
   aria-current={on ? "page" : undefined}
   style={{ display: "flex", alignItems: "center", gap: 7 }}>
 {/* The icon follows the word — currentColor means one rule drives both. */}
 <Icon size={15} strokeWidth={on ? 2.4 : 1.9} color="currentColor" />
 {name}
 </button>
 );
 })}
 </nav>

 <div key={tab}>
 {tab === "home" && <HomeScreen db={db} put={put} biz={biz} range={range} setRange={setRange} go={go} user={user} />}
 {tab === "discover" && <Discover db={db} put={put} jump={jump} go={go} isPro={isPro} requirePro={requirePro} />}
 {tab === "saturation" && <Saturation db={db} go={go} put={put} />}
 {tab === "business" && <Business db={db} biz={biz} put={put} range={range} setRange={setRange} jump={jump} requirePro={requirePro} isPro={isPro} />}
 {tab === "settings" && <SettingsPage db={db} put={put} reset={reset} user={user} signOut={signOut}
   isPro={isPro} ent={ent} refreshEntitlement={refreshEntitlement} entLoading={entLoading} entNote={entNote} />}
 </div>
 </div>

 {/* The fixed bottom tab bar used to live here. It is gone on every screen
     size now — the tab row under the wordmark is the only navigation, which
     means one place to look for it instead of two, and nothing overlaying
     the content. */}

 <FloatingAI db={db} biz={biz} page={tab} focus={jump} user={user} isPro={isPro} requirePro={requirePro} />

 {locked && <PremiumModal feature={locked} onClose={() => setLocked(null)} />}
 </div>
 );
}

/* ── Revenue vs profit chart ─────────────────────────────────────
   Buckets the user's sales into the same window the range filter
   selects, so the chart, the totals under it and the stat tiles are
   always describing one slice of time. */
function chartSeries(sales, range) {
  const dayMs = 864e5;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const buckets = [];

  if (range === "today") {
    for (let i = 0; i < 8; i++) {
      const from = new Date(midnight.getTime() + i * 3 * 36e5);
      const h = from.getHours();
      buckets.push({ from: from.getTime(), to: from.getTime() + 3 * 36e5,
        tick: `${(h % 12) || 12}${h < 12 ? "a" : "p"}`,
        full: `${(h % 12) || 12}${h < 12 ? "am" : "pm"}–${((h + 3) % 12) || 12}${(h + 3) < 12 ? "am" : "pm"}` });
    }
  } else if (range === "7" || range === "30") {
    const n = range === "7" ? 7 : 30;
    for (let i = 0; i < n; i++) {
      const from = new Date(midnight.getTime() - (n - 1 - i) * dayMs);
      buckets.push({ from: from.getTime(), to: from.getTime() + dayMs,
        tick: n === 7 ? "SMTWTFS"[from.getDay()] : String(from.getDate()),
        full: from.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) });
    }
  } else {
    // All time: month buckets from the first sale to now, at least six so a
    // new account still gets a chart rather than a single dot.
    const first = sales.length
      ? new Date(Math.min(...sales.map((x) => new Date(x.soldAt).getTime())))
      : new Date();
    const start = new Date(first.getFullYear(), first.getMonth(), 1);
    const cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0);
    let months = (cur.getFullYear() - start.getFullYear()) * 12 + (cur.getMonth() - start.getMonth()) + 1;
    months = Math.max(6, Math.min(months, 24));
    for (let i = months - 1; i >= 0; i--) {
      const from = new Date(cur.getFullYear(), cur.getMonth() - i, 1);
      const to = new Date(cur.getFullYear(), cur.getMonth() - i + 1, 1);
      buckets.push({ from: from.getTime(), to: to.getTime(),
        tick: from.toLocaleDateString(undefined, { month: "narrow" }),
        full: from.toLocaleDateString(undefined, { month: "long", year: "numeric" }) });
    }
  }

  const points = buckets.map((b) => {
    const inRange = sales.filter((x) => {
      const ts = new Date(x.soldAt).getTime();
      return ts >= b.from && ts < b.to;
    });
    return {
      tick: b.tick, full: b.full,
      revenue: inRange.reduce((a, x) => a + x.amount, 0),
      profit: inRange.reduce((a, x) => a + x.profit, 0),
      sold: inRange.length,
    };
  });

  // Every fifth day is labelled on the 30-day view; all of them would collide.
  const tickEvery = points.length > 12 ? 5 : 1;
  return { points, tickEvery };
}

/* Two series on one axis — both are dollars, so a second scale would be a
   lie. Profit carries the accent and an area fill because it's the number
   that matters; revenue is the recessive reference line above it. The two
   are told apart by dash pattern and end labels as well as colour, so
   identity never rests on hue alone. */
function TrendChart({ sales, range }) {
  const [hover, setHover] = useState(null);
  const [boxW, setBoxW] = useState(0);
  const wrapRef = useRef(null);
  const { points, tickEvery } = useMemo(() => chartSeries(sales, range), [sales, range]);

  /* 320x140 renders about 364x159 in a phone-width card — roughly a 2.3:1
     plot, wide enough to read a trend without the card swallowing the
     screen. A fixed viewBox scales the whole drawing with its container
     though, and the desktop column is up to 1440px wide, where that same
     ratio would make the plot ~570px tall with tick labels blown up to
     match.

     So the viewBox stays 320 wide until the card passes CAP_AT and widens
     past that, buying horizontal room instead of height.

     CAP_AT is the widest card the phone layout ever produces — 494px, the
     inner width of a card in the 560px column. At or below that the maths
     is exactly what it always was, so no width that rendered before the
     desktop layout existed renders differently now. Above it the plot
     holds at MAX_H, which is simply the height it had reached at CAP_AT,
     so the cap is invisible: the chart grows to that height and stops. */
  const H = 140, CAP_AT = 494, MAX_H = Math.round(CAP_AT * H / 320);
  const W = boxW > CAP_AT ? Math.round(boxW * H / MAX_H) : 320;
  const PAD = { t: 14, r: 12, b: 20, l: 12 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const peak = Math.max(1, ...points.map((p) => Math.max(p.revenue, p.profit)));
  const last = points.length - 1;

  const x = (i) => PAD.l + (last === 0 ? iw / 2 : (i / last) * iw);
  const y = (v) => PAD.t + ih - (Math.max(0, v) / peak) * ih;
  const line = (k) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");
  const areaPath = `${line("profit")} L${x(last).toFixed(1)} ${(PAD.t + ih).toFixed(1)} L${x(0).toFixed(1)} ${(PAD.t + ih).toFixed(1)} Z`;

  const hasData = points.some((p) => p.revenue > 0 || p.profit > 0);
  const active = hover == null ? null : points[hover];

  /* Only the width is read, and what changes when the width does is the
     SVG's height, so this can't drive itself in a loop. */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setBoxW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const track = (clientX) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = last === 0 ? 0 : Math.round(((px - PAD.l) / iw) * last);
    setHover(clamp(i, 0, last));
  };

  return (
    <div>
      {/* Readout sits above the plot rather than floating over it. On a chart
          this short a floating tooltip covers the lines it is describing.
          Fixed height, so nothing below it moves when the pointer arrives. */}
      <div role="status" style={{ height: 34, marginBottom: 6 }}>
        <div style={{ fontSize: 9.5, color: C.dead, fontFamily: MONO, height: 13 }}>
          {active ? `${active.full} · ${active.sold} ${active.sold === 1 ? "sale" : "sales"}` : ""}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {[["Profit", C.accent, false, active?.profit], ["Revenue", C.dim, true, active?.revenue]].map(
            ([name, colour, dashed, value]) => (
              <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="4" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="2" x2="14" y2="2" stroke={colour} strokeWidth="2"
                    strokeDasharray={dashed ? "3 2" : undefined} strokeLinecap="round" />
                </svg>
                {active && (
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.bone, fontVariantNumeric: "tabular-nums" }}>
                    {money0(value)}
                  </span>
                )}
                <span style={{ fontSize: 10.5, color: C.dim }}>{name}</span>
              </span>
            ),
          )}
        </div>
      </div>

      <div ref={wrapRef} style={{ position: "relative", touchAction: "pan-y" }}
        onPointerMove={(e) => track(e.clientX)}
        onPointerLeave={() => setHover(null)}>
        {/* height:auto lets the viewBox set the aspect. With a fixed pixel
            height the SVG scaled to fit the shorter axis and sat letterboxed
            in the middle of the card instead of filling it. */}
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Revenue and profit, ${points.length} points`}
          style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}>
          {/* Recessive grid — enough to read a value off, quiet enough to
              stay behind the lines. */}
          {[0, 0.5, 1].map((f) => {
            const gy = PAD.t + ih - f * ih;
            return (
              <g key={f}>
                <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy}
                  stroke={C.line} strokeWidth="1"
                  strokeOpacity={f === 0 ? 1 : 0.45}
                  strokeDasharray={f === 0 ? undefined : "2 4"} />
                {f > 0 && hasData && (
                  <text x={PAD.l} y={gy - 4} fill={C.dead} fontSize="8" fontFamily={MONO}>
                    {money0(peak * f)}
                  </text>
                )}
              </g>
            );
          })}

          {hasData && (
            <>
              <defs>
                <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#profitFill)" />
              <path d={line("revenue")} fill="none" stroke={C.dim} strokeWidth="1.5"
                strokeDasharray="3 2" strokeLinecap="round" strokeLinejoin="round" />
              <path d={line("profit")} fill="none" stroke={C.accent} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* crosshair: the reader aims at a date, not at a 2px line */}
          {active && (
            <>
              <line x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={PAD.t + ih} stroke={C.accent} strokeWidth="1" strokeOpacity="0.45" />
              <circle cx={x(hover)} cy={y(active.revenue)} r="3.5" fill={C.panel} stroke={C.dim} strokeWidth="2" />
              <circle cx={x(hover)} cy={y(active.profit)} r="4.5" fill={C.panel} stroke={C.accent} strokeWidth="2.5" />
            </>
          )}

          {points.map((p, i) => (
            (i % tickEvery === 0 || i === last) && (
              <text key={i} x={x(i)} y={H - 4} textAnchor="middle"
                fill={hover === i ? C.bone : C.dead} fontSize="8.5" fontFamily={MONO}>
                {p.tick}
              </text>
            )
          ))}
        </svg>

      </div>

      {!hasData && (
        <div style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          pointerEvents: "none", fontSize: 11.5, color: C.dead,
        }}>
          No sales in this range yet.
        </div>
      )}
    </div>
  );
}

function HomeScreen({ db, put, biz, range, setRange, go, user }) {
 const [notifOpen, setNotifOpen] = useState(false);
 const hour = new Date().getHours();
 const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
 const msg = MOTIVATION[new Date().getDate() % MOTIVATION.length];
 const unread = db.notifications.filter((n) => !db.readNotifs.includes(n.id)).length;

 const empty = db.inventory.length === 0 && db.sales.length === 0;

 return (
 <div style={{ paddingTop: 4 }}>
 <div className="rise" style={{ ...rise(0), display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div>
 <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.2 }}>
 {greet}, {displayName(user, db.profile) || "there"} 👋
 </h1>
 <p style={{ fontSize: 13.5, color: C.dim, margin: "6px 0 0" }}>{msg}</p>
 </div>
 <button onClick={() => setNotifOpen(true)} aria-label="Notifications" className="fx fx-chip"
 style={{ position: "relative", width: 40, height: 40, borderRadius: 999, background: C.panel, border: `1px solid ${C.line}`, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
 <Bell size={17} color={C.dim} />
 {unread > 0 && <span style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: 999, background: C.accent }} />}
 </button>
 </div>

 <div className="rise" style={{ ...rise(1), display: "flex", gap: 7, marginTop: 18 }}>
 {[["today", "Today"], ["7", "7 Days"], ["30", "30 Days"], ["all", "All Time"]].map(([k, n]) => (
 <button key={k} onClick={() => setRange(k)} className="fx fx-chip"
 style={{ ...pillBtn(range === k), padding: "7px 13px", fontSize: 12 }}>{n}</button>
 ))}
 </div>

 <div className="rise stat-grid" style={{ ...rise(2), display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
 <Stat label="Current balance" value={money0(biz.balance)} accent />
 <Stat label="Items sold" value={biz.itemsSold} />
 <Stat label="Total spent" value={money0(biz.totalSpent)} />
 <Stat label="Inventory value" value={money0(biz.invValue)} sub="estimated" />
 </div>

 {empty && (
 <div className="rise fx-card" style={{ ...rise(3), ...card, marginTop: 12, textAlign: "center", padding: 24 }}>
 <div style={{ fontSize: 30 }}>📦</div>
 <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>No numbers yet</div>
 <p style={{ fontSize: 13, color: C.dim, margin: "8px 0 16px", lineHeight: 1.55 }}>
 Add your first product and your balance, sales and inventory value start tracking for real.
 </p>
 <button onClick={() => go("business")} className="fx fx-accent"
 style={{ background: C.accent, color: C.onAccent, border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>
 Add a product
 </button>
 </div>
 )}

 <div className="rise" style={{ ...rise(4), ...card, marginTop: 12 }}>
 <div style={{ ...label, marginBottom: 13 }}>Revenue vs profit</div>
 <TrendChart sales={db.sales} range={range} />
 <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
 <MiniLine l="Revenue" v={biz.revenue} />
 <MiniLine l="Product cost" v={-biz.cost} />
 <MiniLine l="Platform fees" v={-biz.fees} />
 <MiniLine l="Expenses" v={-biz.expenses} />
 <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8 }}>
 <MiniLine l="Net profit" v={biz.profit} bold />
 </div>
 </div>
 </div>

 {notifOpen && <NotificationCenter db={db} put={put} onClose={() => setNotifOpen(false)} go={go} />}
 </div>
 );
}

function Stat({ label: l, value, sub, accent }) {
 return (
 <div style={{ ...card, padding: 15 }}>
 <div style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>{l}</div>
 <div style={{ fontFamily: MONO, fontSize: 21, fontWeight: 600, marginTop: 7, color: accent ? C.accent : C.bone }}>{value}</div>
 {sub && <div style={{ fontSize: 10.5, color: C.dead, marginTop: 3 }}>{sub}</div>}
 </div>
 );
}
/* The counted sibling of MiniLine. Same row, same weights, same divider
   rhythm — the sold card's table has to sit beside the revenue card's and
   look like it was drawn by the same hand. `to` turns the row into a link
   without changing how it reads. */
const MiniCount = ({ l, v, bold, to }) => {
  const inner = (
    <>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12.5, color: bold ? C.bone : C.dim, fontWeight: bold ? 700 : 400 }}>
        {l}
        {to && <ExternalLink size={11} color={C.dead} />}
      </span>
      <span style={{ fontFamily: MONO, fontSize: bold ? 15 : 12.5, fontWeight: bold ? 600 : 400,
        color: bold ? C.accent : C.bone }}>{v}</span>
    </>
  );
  const box = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" };
  return to
    ? <a href={to} target="_blank" rel="noopener noreferrer" style={{ ...box, textDecoration: "none" }}>{inner}</a>
    : <div style={box}>{inner}</div>;
};

const MiniLine = ({ l, v, bold }) => (
 <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
 <span style={{ fontSize: 12.5, color: bold ? C.bone : C.dim, fontWeight: bold ? 700 : 400 }}>{l}</span>
 <span style={{ fontFamily: MONO, fontSize: bold ? 15 : 12.5, fontWeight: bold ? 600 : 400, color: bold ? (v >= 0 ? C.accent : C.dead) : C.bone }}>
 {v < 0 ? "−" : ""}{money0(Math.abs(v))}
 </span>
 </div>
);

function NotificationCenter({ db, put, onClose, go }) {
 const [open, setOpen] = useState(null);
 const markRead = (id) => { if (!db.readNotifs.includes(id)) put("readNotifs", [...db.readNotifs, id]); };
 return (
 <Sheet title="Notifications" onClose={onClose}>
 {db.notifications.length === 0 && <p style={{ fontSize: 13, color: C.dead }}>Nothing yet.</p>}
 {db.notifications.map((n) => {
 const unread = !db.readNotifs.includes(n.id);
 const isOpen = open === n.id;
 return (
 <div key={n.id} style={{ borderBottom: `1px solid ${C.line}` }}>
 <button onClick={() => { setOpen(isOpen ? null : n.id); markRead(n.id); }}
 style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "13px 2px", display: "flex", gap: 12, alignItems: "flex-start" }}>
 <span style={{ fontSize: 18 }}>{n.icon}</span>
 <span style={{ flex: 1, minWidth: 0 }}>
 <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
 <span style={{ fontSize: 13.5, fontWeight: unread ? 700 : 600 }}>{n.title}</span>
 {unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent }} />}
 </span>
 <span style={{ display: "block", fontSize: 12.5, color: C.dim, marginTop: 3 }}>{n.preview}</span>
 <span style={{ display: "block", fontFamily: MONO, fontSize: 10.5, color: C.dead, marginTop: 5 }}>
 {new Date(n.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
 </span>
 </span>
 </button>
 {isOpen && (
 <p className="rise" style={{ fontSize: 13, color: C.bone, lineHeight: 1.6, margin: "0 0 14px 30px" }}>
 {n.body}
 </p>
 )}
 </div>
 );
 })}
 </Sheet>
 );
}

/* What a free account sees where a premium feature would be.

   It states the price of admission and gets out of the way. No countdown, no
   nagging — the feature is simply not here, and the button that opens the
   checkout is the same one as in Settings. */
/* The three things a free account cannot reach. Kept as data rather than
   spread through the components so the list is auditable in one place —
   what is locked, and what each lock says. */
const LOCKED = {
  ai: {
    title: "AI Discover is premium",
    blurb: "Premium surfaces products that are selling right now across every marketplace, each one measured for demand, competition and saturation — so you find the next thing to flip without going looking for it.",
  },
  search: {
    title: "Product Search is premium",
    blurb: "Search any product and get back real, purchasable listings from across the marketplaces, with demand, competition and saturation measured from what is actually selling rather than guessed at.",
  },
  listing: {
    title: "The listing writer is premium",
    blurb: "Turn a product and its condition into a finished title, description and keyword set, written for the marketplace you're posting to.",
  },
  assistant: {
    title: "The assistant is premium",
    blurb: "Ask anything about your inventory, your numbers or the resale market, and get an answer that already knows your business.",
  },
};

/* The upsell as a dialog rather than a page. The difference matters: a free
   account taps Discover and stays where it was, with an explanation on top,
   instead of being moved to a tab it cannot use and left there. */
function PremiumModal({ feature, onClose }) {
  const copy = LOCKED[feature];

  /* Escape closes it. Without this the only ways out are the two buttons and
     the backdrop, none of which a keyboard reaches first. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!copy) return null;

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.74)", zIndex: 80,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={copy.title}
        className="rise"
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 24,
          width: "100%", maxWidth: 400, padding: "28px 24px 24px", textAlign: "center",
          boxShadow: "0 28px 70px -28px rgba(0,0,0,.8)" }}>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -12, marginRight: -8 }}>
          <button onClick={onClose} aria-label="Close" className="fx"
            style={{ background: C.raised, border: "none", borderRadius: 999, width: 30, height: 30,
              cursor: "pointer", color: C.dim, display: "grid", placeItems: "center" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 14px", color: C.accentText }}>
          <Sparkles size={30} />
        </div>

        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{copy.title}</div>
        <p style={{ fontSize: 13.5, color: C.dim, margin: "10px 0 22px", lineHeight: 1.6 }}>
          {copy.blurb}
        </p>

        <button onClick={openCheckout} className="fx fx-accent"
          style={{ width: "100%", background: C.accent, color: C.onAccent, border: "none", borderRadius: 999,
            padding: "14px", cursor: "pointer", fontSize: 14, fontWeight: 800 }}>
          Upgrade to premium
        </button>

        <button onClick={onClose} className="fx"
          style={{ width: "100%", background: "none", border: "none", marginTop: 10, padding: "10px",
            cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.dim }}>
          Maybe later
        </button>

        <p style={{ fontSize: 11, color: C.dead, margin: "10px 0 0", lineHeight: 1.55 }}>
          Already paid? Open Settings and press “I've paid — check again”.
        </p>
      </div>
    </div>
  );
}

function PremiumGate({ title, blurb, onUpgrade }) {
  return (
    <div className="rise" style={{ ...card, borderRadius: 20, textAlign: "center", padding: "30px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: C.accentText }}>
        <Sparkles size={30} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
      <p style={{ fontSize: 13.5, color: C.dim, margin: "10px auto 20px", lineHeight: 1.6, maxWidth: 380 }}>
        {blurb}
      </p>
      <button onClick={onUpgrade} className="fx fx-accent"
        style={{ background: C.accent, color: C.onAccent, border: "none", borderRadius: 999,
          padding: "13px 26px", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>
        Upgrade to premium
      </button>
      <p style={{ fontSize: 11, color: C.dead, margin: "14px 0 0", lineHeight: 1.55 }}>
        Already paid? Open Settings and press “I've paid — check again”.
      </p>
    </div>
  );
}

/* Opens the checkout. Kept in one place so the two upgrade buttons cannot
   drift apart, and so an unset link fails visibly here rather than opening a
   blank tab for a customer. */
function openCheckout() {
  if (!STRIPE_CHECKOUT_URL) {
    alert("The checkout link hasn't been set yet. Add your Stripe payment link to STRIPE_CHECKOUT_URL in src/App.jsx.");
    return;
  }

  /* The account id rides along as client_reference_id, and Stripe hands it
     back on the webhook. It is the entire mechanism by which a payment is
     matched to an account — without it money arrives attached to nobody and
     somebody has to reconcile it by hand.

     Sending someone to checkout signed out would therefore take their money
     and be unable to upgrade them, so that does not happen. */
  if (!checkoutUserId) {
    alert("Sign in first, so your payment can be matched to your account.");
    return;
  }

  const url = new URL(STRIPE_CHECKOUT_URL);
  url.searchParams.set("client_reference_id", checkoutUserId);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function Discover({ db, put, jump, go, isPro, requirePro }) {
 /* Both AI Discover and Product Search are premium. Saved is not — it is
    the person's own watchlist — so a free account lands there rather than
    on a locked chip. */
 const LOCKED_SUBS = ["ai", "search"];
 const allowed = (k) => (LOCKED_SUBS.includes(k) && !isPro ? "saved" : k);
 const [sub, setSub] = useState(allowed(jump?.sub || (isPro ? "ai" : "saved")));
 const [detail, setDetail] = useState(jump?.item || null);
 useEffect(() => { if (jump?.sub) setSub(allowed(jump.sub)); if (jump?.item) setDetail(jump.item); }, [jump]);
 const pick = (k) => { if (LOCKED_SUBS.includes(k) && !requirePro(k)) return; setSub(k); };

 return (
 <div style={{ paddingTop: 4 }}>
 <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
 {[["ai", "AI Discover", Sparkles], ["search", "Product Search", SearchIcon], ["saved", "Saved", Bookmark]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => pick(k)} className="fx fx-chip"
 style={{ ...pillBtn(sub === k), display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
 <Icon size={14} /> {n}
 </button>
 ))}
 </div>
 {sub === "ai" && (isPro
   ? <AIDiscover db={db} put={put} onDetail={setDetail} />
   : <PremiumGate
       title="AI Discover is premium"
       blurb="Premium finds products that are selling right now, across every marketplace, and measures each one for demand, competition and saturation. Product Search stays free."
       onUpgrade={openCheckout} />)}
 {sub === "search" && isPro && <ProductSearch db={db} onAnalyze={(r) => {
 const known = CATALOG.find((c) => c.title.toLowerCase() === r.title.toLowerCase());
 setDetail(known || { title: r.title, cat: "Other", source: "ebay", comp: null,
 vel: null, sellers: null, comps90: null, trend: "flat" });
 }} />}
 {sub === "saved" && <SavedCompare db={db} put={put} onDetail={setDetail} />}
 {detail && <ProductDetailSheet item={detail} db={db} put={put} onClose={() => setDetail(null)} />}
 </div>
 );
}

function AIDiscover({ db, put, onDetail }) {
 const [rows, setRows] = useState(null);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState(null);
 const [stamp, setStamp] = useState(null);
 const [stage, setStage] = useState(0);
 const [openF, setOpenF] = useState(false);
 const [f, setF] = useState({ mode: "online", state: db.profile.state, zip: db.profile.zip, radius: db.profile.radius, cat: "All", ticket: "all" });

 const STAGES = ["Searching resale coverage…", "Reading seller reports…", "Cross-checking what's moving…", "Ranking by sell speed…"];
 useEffect(() => { (async () => { try {
 const c = await window.storage.get("ros:found");
 if (c) { const { list, at } = JSON.parse(c.value); setRows(list); setStamp(at); }
 } catch {} })(); }, []);
 useEffect(() => { if (!busy) return; const t = setInterval(() => setStage((v) => (v + 1) % STAGES.length), 3000); return () => clearInterval(t); }, [busy]);

 const run = async () => {
 setBusy(true); setErr(null); setStage(0);
 try {
 let list = await SearchProvider.getMarketSignals(f);
 /* Live listings carry no comparable price, so a ticket filter has nothing
    to test them against. Filter only the rows that do have one rather than
    silently dropping every live result. */
 if (f.ticket !== "all") list = list.filter((r) => r.comp == null || TICKET(r.comp) === f.ticket);
 const at = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
 setRows(list); setStamp(at);
 try { await window.storage.set("ros:found", JSON.stringify({ list, at })); } catch {}
 } catch (e) { setErr(e.message); } finally { setBusy(false); }
 };

 return (
 <div>
 <button onClick={() => setOpenF(!openF)} className="fx fx-card"
 style={{ ...card, width: "100%", borderRadius: 999, padding: "12px 18px", cursor: "pointer", color: C.bone, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, borderColor: openF ? C.accent : C.line }}>
 <span style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600 }}>
 <SlidersHorizontal size={16} color={C.accent} />
 {f.mode === "local" ? `Local · ${f.zip || f.state || "set area"} · ${f.radius}mi` : "Online · ships anywhere"}
 </span>
 <span style={{ fontFamily: MONO, fontSize: 13, color: C.dim }}>{openF ? "−" : "+"}</span>
 </button>

 {openF && (
 <div className="rise" style={{ ...card, borderRadius: 20, marginBottom: 14 }}>
 <div style={{ display: "flex", gap: 8, marginBottom: 15 }}>
 {[["online", "Online", Globe], ["local", "Local", MapPin]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => setF({ ...f, mode: k })} className="fx fx-chip"
 style={{ ...pillBtn(f.mode === k), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "11px 0" }}>
 <Icon size={15} /> {n}
 </button>
 ))}
 </div>
 {f.mode === "local" && (
 <>
 <div style={{ display: "flex", gap: 8 }}>
 <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} aria-label="State" style={{ ...inputSt, flex: 1 }}>
 <option value="">State</option>{STATES.map((s) => <option key={s}>{s}</option>)}
 </select>
 <input value={f.zip} inputMode="numeric" maxLength={5} placeholder="ZIP" aria-label="ZIP"
 onChange={(e) => setF({ ...f, zip: e.target.value.replace(/\D/g, "") })} style={{ ...inputSt, flex: 1, fontFamily: MONO }} />
 </div>
 <div style={{ marginTop: 16 }}>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 8 }}>
 <span style={{ color: C.dim }}>Search radius</span>
 <span style={{ fontFamily: MONO, color: C.accentText, fontWeight: 600 }}>{f.radius} mi</span>
 </div>
 <input type="range" min={5} max={100} step={5} value={f.radius} aria-label="Radius"
 onChange={(e) => setF({ ...f, radius: +e.target.value })} style={{ width: "100%", accentColor: C.accent }} />
 </div>
 </>
 )}

 <div style={{ ...label, margin: "16px 0 9px" }}>Category</div>
 <Wrap>
 <button onClick={() => setF({ ...f, cat: "All" })} className="fx fx-chip" style={{ ...pillBtn(f.cat === "All"), padding: "7px 13px", fontSize: 12 }}>All</button>
 {CATEGORIES.map((c) => (
 <button key={c.key} onClick={() => setF({ ...f, cat: c.key })} className="fx fx-chip"
 style={{ ...pillBtn(f.cat === c.key), padding: "7px 13px", fontSize: 12 }}>{c.key}</button>
 ))}
 </Wrap>

 <div style={{ ...label, margin: "16px 0 9px" }}>Ticket size</div>
 <div style={{ display: "flex", gap: 8 }}>
 {[["all", "Any"], ["low", "Low Ticket"], ["high", "High Ticket"]].map(([k, n]) => (
 <button key={k} onClick={() => setF({ ...f, ticket: k })} className="fx fx-chip"
 style={{ ...pillBtn(f.ticket === k), flex: 1, padding: "9px 0", fontSize: 12.5 }}>{n}</button>
 ))}
 </div>
 </div>
 )}

 <button onClick={run} disabled={busy} className={busy ? "" : "fx fx-accent"}
 style={{ width: "100%", padding: "17px 16px", border: "none", borderRadius: 999, cursor: busy ? "wait" : "pointer", fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: busy ? C.raised : C.accent, color: busy ? C.dead : C.onAccent }}>
 {busy ? "Working…" : rows ? "Find again" : "Find products"}
 </button>

 {busy && (
 <div style={{ ...card, marginTop: 12 }}>
 <div style={{ fontFamily: MONO, fontSize: 12.5, animation: "pulse 2s infinite" }}>{STAGES[stage]}</div>
 <div style={{ height: 3, background: C.raised, borderRadius: 999, marginTop: 13, overflow: "hidden" }}>
 <div style={{ height: "100%", width: "38%", background: C.accent, borderRadius: 999, animation: "sweep 1.5s ease-in-out infinite" }} />
 </div>
 <div style={{ marginTop: 16, display: "grid", gap: 9 }}>{[0,1,2].map((i) => <div key={i} className="skel" style={{ height: 64 }} />)}</div>
 </div>
 )}
 {err && !busy && <div style={{ ...card, borderColor: C.accent, marginTop: 12 }}><p style={{ fontSize: 13.5, color: C.accentText, margin: 0, fontWeight: 700 }}>{err}</p></div>}
 {!rows && !busy && !err && <p style={{ fontSize: 12.5, color: C.dead, margin: "16px 4px 0", lineHeight: 1.6 }}>Nothing found yet. Press the button and it searches the web for what's actually moving.</p>}

 {rows && !busy && (
 <>
 <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11.5, color: C.dead, padding: "20px 4px 8px" }}>
 <span>{rows.length} products</span><span>{stamp}</span>
 </div>
 {/* Same rule as Product Search: never let reference data read as a
     live web result. */}
 {rows[0]?.origin === "catalog" && (
 <div style={{ ...card, marginBottom: 8, borderColor: C.accentDim }}>
 <p style={{ fontSize: 12.5, color: C.dim, margin: 0, lineHeight: 1.6 }}>
 Live web search is unavailable, so this is the app's built-in reference
 catalog ranked by sell speed — not what's moving on the web right now.
 </p>
 </div>
 )}
 {rows.map((r, i) => <ProductCard key={i} item={r} idx={i} onDetail={onDetail} />)}
 <p style={{ fontSize: 11.5, color: C.dead, margin: "14px 4px 0", lineHeight: 1.6 }}>
 Market signals from recent web coverage — demand, competition and trend, not a recommendation to pay any specific price.
 </p>
 </>
 )}
 </div>
 );
}

function ProductSearch({ db, onAnalyze }) {
 const [q, setQ] = useState("");
 const [filter, setFilter] = useState("all");
 const [rows, setRows] = useState(null);
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState(null);
 const [sugs, setSugs] = useState([]);
 const [focus, setFocus] = useState(false);
 const [scope, setScope] = useState("online");
 const [blurb, setBlurb] = useState("");

 useEffect(() => { setFilter("all"); }, [scope]);

 useEffect(() => {
 const n = q.toLowerCase().trim();
 if (n.length < 2) { setSugs([]); return; }
 const t = setTimeout(() => {
 /* Names that begin with what was typed come first — those are what
    someone half-way through a word is reaching for — then names that
    merely contain it, so "dunk" still finds "Nike Dunk Low Panda". */
 const a = VOCAB.filter((v) => v.toLowerCase().startsWith(n));
 const b = VOCAB.filter((v) => !v.toLowerCase().startsWith(n) && v.toLowerCase().includes(n));
 /* Also match on any word inside the name, so "panda" or "airwrap" land
    even though neither starts the title. */
 const c = VOCAB.filter((v) => !a.includes(v) && !b.includes(v)
   && v.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(n)));
 setSugs([...a, ...b, ...c].slice(0, 8));
 }, 110);
 return () => clearTimeout(t);
 }, [q]);

 const run = async (term) => {
 const t = term ?? q;
 if (!t.trim()) return;
 setBusy(true); setErr(null); setSugs([]); setBlurb("");
 try {
 const pool = scope === "local" ? LOCAL : ONLINE;
 const marketplaces = filter === "all" ? pool : pool.includes(filter) ? [filter] : pool;
 const [rows_, blurb_] = await Promise.all([
 scope === "local" ? SearchProvider.searchLocalProducts(t, db.profile, marketplaces) : SearchProvider.searchProducts(t, marketplaces),
 describeProduct(t).catch(() => ""),
 ]);
 setRows(rows_); setBlurb(blurb_);
 } catch (e) { setErr(e.message); } finally { setBusy(false); }
 };

 const chips = ["all", ...(scope === "local" ? LOCAL : ONLINE)];

 return (
 <div>
 <div style={{ position: "relative" }}>
 <div style={{ display: "flex", gap: 8 }}>
 <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)}
 onBlur={() => setTimeout(() => setFocus(false), 140)} onKeyDown={(e) => e.key === "Enter" && run()}
 placeholder="Jordan 4 Black Cat, PS5, Dyson Airwrap…" style={{ ...inputSt, flex: 1 }} />
 <button onClick={() => run()} disabled={busy} className="fx fx-accent"
 style={{ background: C.accent, color: C.onAccent, border: "none", borderRadius: 999, padding: "0 24px", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>{busy ? "…" : "Go"}</button>
 </div>
 {focus && sugs.length > 0 && (
 <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 30, ...card, padding: 0, overflow: "hidden", boxShadow: "0 18px 44px -12px rgba(0,0,0,.6)" }}>
 {sugs.map((v, i) => (
 <button key={v} onMouseDown={() => { setQ(v); run(v); }} className="lnk"
 style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: i ? `1px solid ${C.line}` : "none", padding: "12px 17px", cursor: "pointer", fontSize: 14, color: C.bone, display: "flex", alignItems: "center", gap: 10 }}>
 <SearchIcon size={13} color={C.accent} />{v}
 </button>
 ))}
 </div>
 )}
 </div>

 <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
 {[["online", "Online", Globe], ["local", "Local", MapPin]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => setScope(k)} className="fx fx-chip"
 style={{ ...pillBtn(scope === k), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", fontSize: 12.5 }}>
 <Icon size={14} /> {n}
 </button>
 ))}
 </div>
 {scope === "local" && (
 <p style={{ fontSize: 11.5, color: C.dim, margin: "9px 4px 0", lineHeight: 1.5 }}>
 Searching {db.profile.zip || db.profile.state || "your area"}, {db.profile.radius} mile radius.
 </p>
 )}

 <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
 {chips.map((k) => (
 <button key={k} onClick={() => setFilter(k)} className="fx fx-chip"
 style={{ ...pillBtn(filter === k), padding: "8px 14px", fontSize: 12.5 }}>
 {k === "all" ? "All" : MARKETS[k].label}
 </button>
 ))}
 </div>

 {blurb && !busy && (
 <div className="rise" style={{ ...card, borderRadius: 16, marginTop: 14 }}>
 <div style={{ ...label, marginBottom: 8 }}>What this is</div>
 <p style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, margin: 0 }}>{blurb}</p>
 </div>
 )}

 {busy && <div style={{ marginTop: 18, display: "grid", gap: 9 }}>{[0,1,2].map((i) => <div key={i} className="skel" style={{ height: 74 }} />)}</div>}
 {err && !busy && <p style={{ fontSize: 13.5, color: C.accentText, marginTop: 16, fontWeight: 600 }}>{err}</p>}
 {rows?.length === 0 && !busy && (
 <div style={{ padding: "34px 4px" }}>
 <p style={{ fontFamily: MONO, fontSize: 14, margin: 0 }}>No listings found.</p>
 <p style={{ fontSize: 13, color: C.dim, margin: "8px 0 0" }}>Try a more specific product name.</p>
 </div>
 )}
 {rows === null && !busy && (
 <p style={{ fontSize: 13, color: C.dim, margin: "26px 4px", lineHeight: 1.6 }}>
 Search a specific product and get back real, purchasable listing pages only — no news, no blogs, no forum posts.
 </p>
 )}

 {/* Say plainly when these came from the built-in catalog instead of a
     live search, and why. Passing reference data off as web results
     would be the worst outcome here. */}
 {rows?.[0]?.source === "catalog" && (
 <div style={{ ...card, marginTop: 16, borderColor: C.accentDim }}>
 <p style={{ fontSize: 12.5, color: C.dim, margin: 0, lineHeight: 1.6 }}>
 {rows[0].matched
 ? "Live web search is unavailable, so these are matches from the app's built-in reference catalog. Analyze works fully on them. View Product opens a sold-listings search on that marketplace."
 : `Live web search is unavailable and the built-in catalog has no match for that. Showing all ${rows.length} reference products instead.`}
 {/* The precise fault, straight from the search function. This is what
     turns "it doesn't work" into a fix you can act on. */}
 {rows[0].reason && (
 <span style={{ display: "block", marginTop: 7, color: C.accentText, fontFamily: MONO, fontSize: 11.5 }}>
 {rows[0].reason}
 </span>
 )}
 </p>
 </div>
 )}

 <div style={{ marginTop: 16 }}>
 {rows?.map((r, i) => (
 <div key={i} className="rise fx-card" style={{ ...rise(i), ...card, borderRadius: 16, marginBottom: 8 }}>
 <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
 <Thumb size={50} />
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{r.title}</div>
 <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim, marginTop: 5 }}>
 {r.market}{r.cond ? ` · ${r.cond}` : ""}
 </div>
 </div>
 </div>
 <div style={{ display: "flex", gap: 7, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 <button onClick={() => onAnalyze(r)} className="fx fx-chip"
 style={{ ...pillBtn(false), flex: 1, padding: "9px 0", fontSize: 12.5, fontWeight: 700 }}>
 Analyze
 </button>
 <a href={r.url} target="_blank" rel="noopener noreferrer" className="lnk"
 style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12.5, fontWeight: 700, padding: "9px 0", borderRadius: 999, color: C.bone, border: `1px solid ${C.accentDim}`, textDecoration: "none" }}>
 View Product <ExternalLink size={11} />
 </a>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}

const TrendIcon = ({ trend }) =>
 trend === "up" ? <TrendingUp size={13} color={C.accent} /> :
 trend === "down" ? <TrendingDown size={13} color={C.dead} /> :
 <Minus size={13} color={C.dim} />;

function SavedCompare({ db, put, onDetail }) {
 const [picked, setPicked] = useState([]);
 const [compare, setCompare] = useState(false);
 const list = db.watchlist || [];

 const toggle = (title) => setPicked((p) => p.includes(title) ? p.filter((t) => t !== title) : [...p, title]);
 const remove = async (title) => put("watchlist", list.filter((w) => w.title !== title));

 /* Prefer the catalog row when there is one — it holds 90 days of reference
    data — and otherwise use what was saved with the product. Compare used to
    resolve titles through the catalog alone and `.filter(Boolean)` whatever
    it could not find, so picking two searched products opened a sheet
    reading "0 products" with nothing in it. Nothing is dropped now; a
    product with no measurements says so. */
 const resolve = (w) => {
   const ref = CATALOG.find((c) => c.title === w.title);
   return ref ? { ...w, ...ref, inCatalog: true } : { trend: "flat", ...w, inCatalog: false };
 };
 const items = picked
   .map((t) => list.find((w) => w.title === t))
   .filter(Boolean)
   .map(resolve);

 if (!list.length) return <Empty icon="🔖" title="Nothing saved yet"
 body="Save a product from Discover, Product Search or Saturation and it shows up here to compare side by side." />;

 return (
 <div>
 {list.map((w, i) => {
 const on = picked.includes(w.title);
 const it = resolve(w);
 return (
 <div key={w.title} className="rise" style={{ ...rise(i), ...card, borderRadius: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
 <button onClick={() => toggle(w.title)} aria-label={on ? "Deselect" : "Select"}
 style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: "pointer", background: on ? C.accent : "transparent", border: `1.5px solid ${on ? C.accent : C.line}`, display: "grid", placeItems: "center" }}>
 {on && <Check size={14} color={C.onAccent} />}
 </button>
 {/* Opens whatever was saved. This was gated on finding a catalog row,
     which made every searched product in this list dead to the touch. */}
 <button onClick={() => onDetail(it)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", color: C.bone }}>
 <div style={{ fontSize: 14, fontWeight: 700 }}>{w.title}</div>
 <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
 {it.cat}{it.inCatalog ? "" : " · measured when opened"}
 </div>
 </button>
 <button onClick={() => remove(w.title)} aria-label="Remove" className="fx"
 style={{ background: "none", border: "none", cursor: "pointer", color: C.dead, padding: 4, flexShrink: 0 }}>
 <X size={15} />
 </button>
 </div>
 );
 })}

 <button onClick={() => setCompare(true)} disabled={picked.length < 2} className={picked.length >= 2 ? "fx fx-accent" : ""}
 style={{ width: "100%", marginTop: 10, padding: "14px", borderRadius: 999, border: "none", cursor: picked.length >= 2 ? "pointer" : "not-allowed", fontSize: 13.5, fontWeight: 700, background: picked.length >= 2 ? C.accent : C.raised, color: picked.length >= 2 ? C.onAccent : C.dead }}>
 Compare {picked.length >= 2 ? `(${picked.length})` : "— pick 2 or more"}
 </button>

 {compare && (
 <Sheet title="Compare" sub={`${items.length} products`} onClose={() => setCompare(false)}>
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 {items.map((it) => {
 const v = verdict(it);
 return (
 <div key={it.title} style={{ ...card, borderRadius: 16 }}>
 <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{it.title}</div>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <Mini l="Demand" v={demandLabel(it.vel)} />
 <Mini l="Competition" v={compLabel(it.sellers)} />
 <Mini l="Saturation" v={satLabel(it.vel, it.sellers)} />
 {/* "Flat" is the placeholder a searched product is saved with, not a
     measurement — printing it here would claim a trend nobody read. */}
 <Mini l="Trend" v={!it.inCatalog ? "Unknown"
   : it.trend === "up" ? "Rising" : it.trend === "down" ? "Falling" : "Flat"} />
 </div>
 <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: VERDICT_COLOR[v.tone], marginTop: 10 }}>
 {v.label}
 </div>
 {!it.inCatalog && (
 <p style={{ fontSize: 11.5, color: C.dead, margin: "8px 0 0", lineHeight: 1.55 }}>
 Found by searching, so there's no reference data behind it yet. Open it
 from Saved and it gets measured against live listings.
 </p>
 )}
 </div>
 );
 })}
 </div>
 </Sheet>
 )}
 </div>
 );
}

const VERDICT_COLOR = { good: C.accent, bad: C.dead, neutral: C.dim };

function ProductCard({ item, idx, onDetail }) {
 const kind = MARKETS[item.source]?.kind === "local" ? "Local" : "Online";
 const v = verdict(item);
 return (
 <div className="rise fx-card" style={{ ...rise(idx), ...card, borderRadius: 16, marginBottom: 8, transition: "border-color .16s, background .16s" }}>
 <div style={{ display: "flex", gap: 13 }}>
 <Thumb cat={item.cat} />
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>{item.title}</div>
 <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
 {/* No trend icon on a live listing — a flat dash there reads as a
     measured "no movement" rather than "not measured yet". */}
 {item.vel != null && <TrendIcon trend={item.trend} />}
 <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
 {/* A live listing has no counted demand behind it, so name the
     marketplace it is on instead of printing "Demand Unknown". */}
 {item.vel == null
   ? `${item.cat} · ${kind} · ${marketLabel(item.source)}`
   : `${item.cat} · ${kind} · Demand ${demandLabel(item.vel)}`}
 </span>
 </div>
 {item.why && <div style={{ fontSize: 12, color: C.dead, marginTop: 5 }}>{item.why}</div>}
 </div>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 {/* The verdict is a call made from counted signals. A live listing has
     none yet, so it says what to do about that rather than shouting
     "NOT ENOUGH DATA" at every card on the screen. */}
 {/* A live listing has a page you can open. Linking straight to it is
     the thing a person actually wants from a search result, and it was
     missing — the only way through was See More, which opens an analysis
     rather than the item. The verdict line stays where there is no link. */}
 {item.url ? (
 <a href={item.url} target="_blank" rel="noopener noreferrer"
   onClick={(e) => e.stopPropagation()}
   style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 10.5,
     fontWeight: 700, letterSpacing: "0.04em", color: C.accentText, textDecoration: "none" }}>
   VIEW ON {String(item.market || marketLabel(item.source) || "listing").toUpperCase()}
   <ExternalLink size={11} />
 </a>
 ) : (
 <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: item.vel == null ? C.dead : VERDICT_COLOR[v.tone] }}>
 {item.vel == null ? "TAP TO MEASURE" : v.label}
 </span>
 )}
 <button onClick={() => onDetail(item)} className="fx fx-chip"
 style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.accentDim}`, borderRadius: 999, padding: "7px 14px", color: C.bone, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
 See More <ChevronRight size={13} />
 </button>
 </div>
 </div>
 );
}

/* ── Sold activity over the selected window ───────────────────────
   Read this before trusting the shape of the line.

   The reference data holds three things per product: a 90-day sold count,
   a weekly sell-through rate, and a trend direction. That is a total and a
   slope — not a day-by-day sales history. So this does not claim to know
   what sold on any given day. It distributes the window's estimated total
   across buckets along the slope the trend implies: rising, level or
   falling. The buckets always add back to exactly the number printed above
   the chart.

   So the total is an estimate and the shape is a model of the trend. That
   is what the card already tells the reader it is, and connecting a
   marketplace replaces both with counted sales. */
/* Below this many dated listings inside the widest window, a line is three
   dots pretending to be a trend. The card hands over to the marketplace
   links instead. */
const DATED_MIN = 3;

/* The three windows the sheet offers, and the wording for each. Kept in one
   place because the chip, the number above the chart and the footnote all
   have to describe the same span. */
const SOLD_WINDOWS = [
  { d: 7, chip: "7d", phrase: "in the last 7 days" },
  { d: 21, chip: "3w", phrase: "in the last 3 weeks" },
  { d: 30, chip: "30d", phrase: "in the last 30 days" },
];
const WIDEST_WINDOW = 30;
const windowPhrase = (d) =>
  (SOLD_WINDOWS.find((w) => w.d === d) || { phrase: `in the last ${d} days` }).phrase;

/* Bucket widths per window, picked to give a readable number of points
   without implying daily precision the data doesn't have. */
const soldPlan = (windowDays) =>
  windowDays <= 7 ? { n: 7, days: 1 }
    : windowDays <= 21 ? { n: 7, days: 3 }
    : { n: 10, days: 3 };

/* Bucket edges and labels, shared by the modelled series and the counted one
   so "7d" means the same seven days whichever fills it. Buckets are
   half-open [from, to) and the last one ends at tomorrow's midnight, so a
   listing that sold today lands in it. */
function soldFrames(plan) {
  const dayMs = 864e5;
  const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setTime(tomorrow.getTime() + dayMs);
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  return Array.from({ length: plan.n }, (_, i) => {
    const to = tomorrow.getTime() - (plan.n - 1 - i) * plan.days * dayMs;
    const from = new Date(to - plan.days * dayMs);
    const last = new Date(to - dayMs);
    return {
      from: from.getTime(),
      to,
      tick: plan.days === 1 ? "SMTWTFS"[from.getDay()] : fmt(from, { month: "numeric", day: "numeric" }),
      full: plan.days === 1
        ? fmt(from, { weekday: "short", day: "numeric", month: "short" })
        : `${fmt(from, { month: "short", day: "numeric" })} \u2013 ${fmt(last, { month: "short", day: "numeric" })}`,
    };
  });
}

/* The counted counterpart to soldSeries: real sale dates, read off the
   completed listings themselves, dropped into those same buckets. Nothing
   here is modelled or smoothed — a bucket reads zero because no listing said
   it sold then, and `inWindow` is how many dated listings the line accounts
   for. */
function datedSeries(dates, windowDays) {
  const plan = soldPlan(windowDays);
  const frames = soldFrames(plan);
  const counts = new Array(plan.n).fill(0);
  let inWindow = 0;

  for (const iso of dates || []) {
    /* Split by hand rather than letting Date parse it: "2026-09-12" parses as
       UTC midnight, which is the previous day west of Greenwich and would
       drop a listing into the wrong bucket. */
    const [y, m, d] = String(iso).split("-").map(Number);
    if (!y || !m || !d) continue;
    const t = new Date(y, m - 1, d).getTime();
    if (isNaN(t) || t < frames[0].from) continue;
    for (let i = plan.n - 1; i >= 0; i--) {
      if (t >= frames[i].from && t < frames[i].to) { counts[i] += 1; inWindow += 1; break; }
    }
  }

  const points = frames.map((f, i) => ({ sold: counts[i], tick: f.tick, full: f.full }));
  return { points, tickEvery: points.length > 10 ? 2 : 1, inWindow, dated: (dates || []).length };
}

function soldSeries(item, windowDays, total) {
  const ref = CATALOG.find((c) => c.title === item.title) || item;
  const plan = soldPlan(windowDays);

  // Trend sets the ratio between the oldest bucket and the newest one.
  const ratio = ref.trend === "up" ? 1.75 : ref.trend === "down" ? 0.55 : 1;
  const weights = Array.from({ length: plan.n }, (_, i) =>
    1 + (ratio - 1) * (plan.n === 1 ? 1 : i / (plan.n - 1)));
  const sum = weights.reduce((a, w) => a + w, 0);

  /* Carry the rounding remainder forward and give the last bucket whatever
     is left, so the buckets sum to `total` exactly rather than to total ± n
     after independent rounding. */
  let exact = 0, used = 0;
  const counts = weights.map((w, i) => {
    exact += (w / sum) * total;
    const v = i === plan.n - 1 ? total - used : Math.round(exact - used);
    used += v;
    return Math.max(0, v);
  });

  const frames = soldFrames(plan);
  const points = counts.map((sold, i) => ({ sold, tick: frames[i].tick, full: frames[i].full }));
  return { points, tickEvery: points.length > 10 ? 2 : 1 };
}

/* One-series sibling of TrendChart, deliberately not a rewrite of it — the
   home chart plots two money series against each other and works; this
   plots counts. Same visual language: readout above the plot so nothing
   covers the line, quiet grid, accent line over a gradient, crosshair and
   marker on hover, fixed-height status row so nothing shifts. */
/* Where to go when the app cannot chart it.

   A line needs dates on the data and the live measurement has none — it is
   "these completed listings exist now", not "this many sold each day". Rather
   than draw a shape invented to look like history, hand over to the
   marketplaces that actually hold the sold history, and say how many
   listings were found on each so the links are ranked by where the activity
   is. */
const MARKET_KEY_BY_LABEL = Object.fromEntries(
  Object.keys(MARKETS).map((k) => [marketLabel(k), k]),
);

function SoldElsewhere({ title, counts }) {
  const rows = Object.entries(counts || {})
    .filter(([label, n]) => n > 0 && MARKETS[MARKET_KEY_BY_LABEL[label]]?.url)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, margin: "0 0 12px" }}>
        Not enough sold history to chart this one. These marketplaces had
        completed listings for it — open one to see the actual sold prices
        and dates.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(([label, n]) => (
          <a key={label} href={MARKETS[MARKET_KEY_BY_LABEL[label]].url(title)}
            target="_blank" rel="noopener noreferrer" className="fx fx-chip"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, padding: "11px 14px", borderRadius: 14, textDecoration: "none",
              background: C.raised, border: `1px solid ${C.line}`, color: C.bone }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>
                {n} found
              </span>
              <ExternalLink size={13} color={C.dim} />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* `series` is the counted path: a series already built from real sale dates.
   When it is absent the chart falls back to the modelled catalog curve, which
   is what the card's own wording says it is. Same drawing either way — only
   the source of the numbers differs. */
function SoldChart({ item, windowDays, total, series = null }) {
  const [hover, setHover] = useState(null);
  const [boxW, setBoxW] = useState(0);
  const wrapRef = useRef(null);
  const modelled = useMemo(
    () => (series ? null : soldSeries(item, windowDays, total)), [item.title, windowDays, total, series]); // eslint-disable-line
  const { points, tickEvery } = series || modelled;

  /* Same geometry as TrendChart, deliberately — see the note there. The two
     charts sit in the same app and should read as one thing. */
  const H = 140, CAP_AT = 494, MAX_H = Math.round(CAP_AT * H / 320);
  const W = boxW > CAP_AT ? Math.round(boxW * H / MAX_H) : 320;
  const PAD = { t: 14, r: 12, b: 20, l: 12 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const peak = Math.max(1, ...points.map((p) => p.sold));
  const last = points.length - 1;

  const x = (i) => PAD.l + (last === 0 ? iw / 2 : (i / last) * iw);
  const y = (v) => PAD.t + ih - (Math.max(0, v) / peak) * ih;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sold).toFixed(1)}`).join(" ");
  const area = `${line} L${x(last).toFixed(1)} ${(PAD.t + ih).toFixed(1)} L${x(0).toFixed(1)} ${(PAD.t + ih).toFixed(1)} Z`;
  const active = hover == null ? null : points[hover];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setBoxW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const track = (clientX) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    setHover(clamp(last === 0 ? 0 : Math.round(((px - PAD.l) / iw) * last), 0, last));
  };

  return (
    <div>
      <div role="status" style={{ height: 34, marginBottom: 6 }}>
        <div style={{ fontSize: 9.5, color: C.dead, fontFamily: MONO, height: 13 }}>
          {active ? active.full : ""}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <svg width="14" height="4" aria-hidden="true" style={{ flexShrink: 0 }}>
            <line x1="0" y1="2" x2="14" y2="2" stroke={C.accent} strokeWidth="2" strokeLinecap="round" />
          </svg>
          {active && (
            <span style={{ fontSize: 13, fontWeight: 800, color: C.bone, fontVariantNumeric: "tabular-nums" }}>
              {active.sold}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: C.dim }}>
            {active ? "sold" : "Sold over time"}
          </span>
        </div>
      </div>

      <div ref={wrapRef} style={{ position: "relative", touchAction: "pan-y" }}
        onPointerMove={(e) => track(e.clientX)}
        onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Sold activity, ${points.length} points ${windowPhrase(windowDays)}`}
          style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}>
          {[0, 0.5, 1].map((f) => {
            const gy = PAD.t + ih - f * ih;
            return (
              <g key={f}>
                <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke={C.line} strokeWidth="1"
                  strokeOpacity={f === 0 ? 1 : 0.45} strokeDasharray={f === 0 ? undefined : "2 4"} />
                {f > 0 && (
                  <text x={PAD.l} y={gy - 4} fill={C.dead} fontSize="8" fontFamily={MONO}>
                    {Math.round(peak * f)}
                  </text>
                )}
              </g>
            );
          })}

          <defs>
            <linearGradient id="soldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
              <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#soldFill)" />
          <path d={line} fill="none" stroke={C.accent} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />

          {active && (
            <>
              <line x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={PAD.t + ih}
                stroke={C.accent} strokeWidth="1" strokeOpacity="0.45" />
              <circle cx={x(hover)} cy={y(active.sold)} r="4.5" fill={C.panel}
                stroke={C.accent} strokeWidth="2.5" />
            </>
          )}

          {points.map((p, i) => (
            (i % tickEvery === 0 || i === last) && (
              <text key={i} x={x(i)} y={H - 4} textAnchor="middle"
                fill={hover === i ? C.bone : C.dead} fontSize="8.5" fontFamily={MONO}>
                {p.tick}
              </text>
            )
          ))}
        </svg>
      </div>
    </div>
  );
}

/* One measurement per product per session. Opening the same item again —
   from Saved, from Saturation, from a search you scrolled back to — reuses
   it rather than spending two more searches on an answer already held.
   Deliberately not persisted: "measured just now" has to stay true. */
const LIVE_CACHE = new Map();

function ProductDetailSheet({ item, db, put, onClose }) {
 const [window_, setWindowD] = useState(30);
 const [sold, setSold] = useState(null);
 const [live, setLive] = useState(null);
 const [related, setRelated] = useState([]);
 const [saved, setSaved] = useState(false);
 const [showCost, setShowCost] = useState(false);
 const [cost, setCost] = useState("");
 const s = db.settings;

 /* What the live measurement actually counted, if it ran and found
    anything. Read in several places below, so derived once. */
 /* A catalog row carries reference data measured over 90 days. A live pass
    sees at most twenty listings. The catalog wins for the judgement tiles;
    the live pass is what gives the chart its dates. */
 const inCatalog = CATALOG.some((c) => c.title === item.title);
 const counted = Number(live?.soldSeen) || 0;
 const countedMarkets = Object.keys(live?.soldByMarket || {}).filter((k) => live.soldByMarket[k] > 0);

 /* Sale dates the completed listings stated outright. Far fewer than
    `counted` — most listings don't say — so the chart only goes up when
    enough of them fall inside the widest window on offer. Below that a line
    would be three dots pretending to be a trend, and the marketplace links
    are the more honest answer. */
 const soldDates = live?.soldDates || [];

 /* Each marketplace's share of the sales the line is drawn from, counted in
    the window on screen. These sum to the chart's total by construction —
    same dates, same buckets, just grouped. */
 const datedByMarket = Object.entries(live?.soldDatesByMarket || {})
   .map(([label, dates]) => [label, datedSeries(dates, window_).inWindow])
   .filter(([, n]) => n > 0)
   .sort((a, b) => b[1] - a[1]);

 const datedChart = soldDates.length >= DATED_MIN
   && datedSeries(soldDates, WIDEST_WINDOW).inWindow >= DATED_MIN
   ? datedSeries(soldDates, window_)
   : null;

 useEffect(() => {
 setSaved((db.watchlist || []).some((w) => w.title === item.title));
 SearchProvider.getRecentSoldData(item.title, window_).then(setSold);
 SearchProvider.findSimilarProducts(item).then(setRelated);
 }, [item.title, window_]); // eslint-disable-line

 /* Go and measure the product: two searches, one for active listings and
    one for completed ones.

    This used to be skipped for anything the catalog already covered, on the
    grounds that opening a known product should cost nothing. That was also
    why the sold-over-time line never appeared in AI Discover or Product
    Search — both surface catalog-backed products, so both took the skip and
    fell back to the modelled curve. Real dated sales beat a model, so the
    measurement now runs for everything and the results are cached per title
    for the session, which is what keeps reopening free. */
 useEffect(() => {
   let alive = true;
   const cached = LIVE_CACHE.get(item.title);
   if (cached) { setLive(cached); return; }
   setLive({ loading: true });
   SearchProvider.analyzeProduct(item.title)
     .then((r) => { LIVE_CACHE.set(item.title, r); if (alive) setLive(r); })
     .catch((e) => alive && setLive({ error: e.message || "Couldn't analyze this product." }));
   return () => { alive = false; };
 }, [item.title]);

 const save = async () => {
 const list = db.watchlist || [];
 /* Save the product, not just its name. It used to store title and category
    only, and Saved rebuilt everything else by looking the title up in the
    catalog — so anything found by searching came back as nothing, could not
    be opened, and was dropped from Compare without a word. */
 const entry = {
   title: item.title, cat: item.cat, source: item.source ?? null,
   comp: item.comp ?? null, vel: item.vel ?? null, sellers: item.sellers ?? null,
   comps90: item.comps90 ?? null, trend: item.trend ?? "flat",
   savedAt: new Date().toISOString(),
 };
 await put("watchlist", saved ? list.filter((w) => w.title !== item.title) : [...list, entry]);
 setSaved(!saved);
 };

 const c = +cost || 0;
 const calc = (c > 0 && item.comp > 0) ? profitFrom({ sell: item.comp, cost: c, feePct: s.feePct, pay: s.payPct, ship: s.ship }) : null;
 const kind = MARKETS[item.source]?.kind === "local" ? "Local" : "Online";

 /* No verdict banner here. It used to open with a full-width VERY GOOD /
    VERY BAD in 26px, which announced a conclusion before showing any of
    the numbers it came from — and it is a two-way call derived from four
    signals, so stating it that loudly overstated how certain it is. The
    same four signals are right below, and the What We Analyzed card
    explains them in words. */
 return (
 <Sheet title={item.title} sub="Market data — estimates, not guarantees" onClose={onClose}>
 {/* Catalog products keep their own numbers. Everything else reads the
     two live passes, so a searched product gets measured signals instead
     of four tiles saying "Unknown". */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 6 }}>
 {live?.listings !== undefined && !inCatalog ? (
 <>
 <Mini l="Demand" v={seenDemandLabel(live.soldSeen)} />
 <Mini l="Competition" v={seenCompLabel(live.listings)} />
 <Mini l="Saturation" v={seenSatLabel(live.listings, live.soldSeen)} />
 <Mini l="Marketplaces" v={live.markets.length ? String(live.markets.length) : "—"} />
 </>
 ) : (
 <>
 <Mini l="Demand" v={live?.loading && !inCatalog ? "Checking…" : demandLabel(item.vel)} />
 <Mini l="Competition" v={live?.loading && !inCatalog ? "Checking…" : compLabel(item.sellers)} />
 <Mini l="Saturation" v={live?.loading && !inCatalog ? "Checking…" : satLabel(item.vel, item.sellers)} />
 <Mini l="Trend" v={item.trend === "up" ? "Rising" : item.trend === "down" ? "Falling" : "Flat"} />
 </>
 )}
 </div>

 {/* The raw counts those labels came from, said plainly. A label like
     "High" is a judgement; "18 active listings seen" is the evidence,
     and the reader is entitled to both. */}
 {live?.listings !== undefined && (
 <div style={{ ...card, marginTop: 10 }}>
 <div style={{ ...label, marginBottom: 10 }}>Measured just now</div>
 <Row l="Active listings found" r={`${live.listings}${live.listingsCapped ? "+" : ""}`} />
 <Row l="Sold listings found" r={`${live.soldSeen}${live.soldCapped ? "+" : ""}`} />
 <Row l="Selling on" r={live.markets.length ? live.markets.join(", ") : "None found"} />
 <Row l="Sold data from" r={live.soldMarkets.length ? live.soldMarkets.join(", ") : "None found"} />
 {live.datedCount > 0 && <Row l="Sale dates read" r={String(live.datedCount)} />}
 <p style={{ fontSize: 11, color: C.dead, margin: "10px 0 0", lineHeight: 1.55 }}>
 Counted from live marketplace listings, up to 20 per search — a "+" means
 at least that many, not a total. The sold-over-time line is built only from
 listings that stated their own sale date; a complete sales history and a
 trend direction still need a connected marketplace account.
 </p>
 </div>
 )}

 {live?.error && (
 <div style={{ ...card, marginTop: 10, borderColor: C.accentDim }}>
 <p style={{ fontSize: 12.5, color: C.dim, margin: 0, lineHeight: 1.6 }}>
 Couldn't measure this product live. <span style={{ fontFamily: MONO, color: C.accentText }}>{live.error}</span>
 </p>
 </div>
 )}

 {/* Hidden entirely when there is nothing to say: no catalog history, the
     live count finished, and it found nothing. An empty card that only
     explains its own emptiness is worse than no card. */}
 {!(sold?.unavailable && !live?.loading && counted === 0) && (
 <div style={{ ...card, marginTop: 10 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
 <span style={label}>Recent sold activity</span>
 {/* Hidden when the numbers come from counted listings that carried no
     dates: putting an undated count under a 7d chip would be claiming a
     time range nobody measured. Once enough listings state a sale date,
     the window means something again and the chips come back. */}
 {!(sold?.unavailable && counted > 0 && !datedChart) && (
 <div style={{ display: "flex", gap: 5 }}>
 {SOLD_WINDOWS.map((w) => (
 <button key={w.d} onClick={() => setWindowD(w.d)} className="fx fx-chip"
 style={{ ...pillBtn(window_ === w.d), padding: "4px 9px", fontSize: 10.5 }}>{w.chip}</button>
 ))}
 </div>
 )}
 </div>
 {/* A product that came from a live search has no catalog row, so the
     estimate below has nothing to work from — but the sheet has already
     gone and counted real sold listings for it. Use those. */}
 {!sold ? (
 <div style={{ fontFamily: MONO, fontSize: 13, color: C.dead }}>Checking…</div>
 ) : datedChart ? (
 /* Counted sales with counted dates: a real time series. Every point is
    listings that said they sold in that bucket, so an empty bucket is an
    empty bucket rather than a gap smoothed over.

    Laid out like Revenue vs profit on the home screen — chart, rule, the
    numbers behind it, bold total — because it is the same kind of card and
    should read like one. */
 <>
 <SoldChart item={item} windowDays={window_} series={datedChart} />
 <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
 {datedByMarket.map(([label, n]) => (
 <MiniCount key={label} l={label} v={n}
 to={MARKETS[MARKET_KEY_BY_LABEL[label]]?.url?.(item.title)} />
 ))}
 <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8 }}>
 <MiniCount l={`Sold ${windowPhrase(window_)}`} v={datedChart.inWindow} bold />
 </div>
 </div>
 </>
 ) : sold.unavailable && live?.loading ? (
 <div style={{ fontFamily: MONO, fontSize: 13, color: C.dead }}>Counting sold listings…</div>
 ) : sold.unavailable && counted > 0 ? (
 <>
 <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600 }}>
 {counted}{live.soldCapped ? "+" : ""} <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}>
 sold listings found{countedMarkets.length ? ` across ${countedMarkets.length} marketplace${countedMarkets.length > 1 ? "s" : ""}` : ""}
 </span>
 </div>
 <SoldElsewhere title={item.title} counts={live.soldByMarket} />
 </>
 ) : sold.unavailable ? (
 <div style={{ fontFamily: MONO, fontSize: 14, color: C.dim }}>No reliable sold data</div>
 ) : (
 <>
 <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600 }}>
 {sold.count} <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}>sold {windowPhrase(window_)}</span>
 </div>
 {/* The modelled fallback: a catalog product whose completed listings
     didn't state enough dates to plot, or one still being measured. It
     is replaced by the real line the moment enough dates arrive. */}
 <div style={{ marginTop: 12 }}>
 <SoldChart item={item} windowDays={window_} total={sold.count} />
 </div>
 </>
 )}
 <p style={{ fontSize: 11, color: C.dead, margin: "8px 0 0" }}>
 {datedChart
 ? `Read off completed listings that stated their own sale date. Search doesn't surface every sale, so every point is a floor — read the shape, not the height.`
 : sold?.unavailable && counted > 0
 ? `Counted from completed listings found just now${live.soldCapped ? ", and capped at the search limit — the real number is higher" : ""}. None of them stated a sale date, so there's nothing to plot over time. Search does not surface every sale, so read it as a floor rather than a total.`
 : sold?.unavailable
 ? "This product isn't in our reference data. Use the marketplace links below to check sold listings directly."
 : sold?.estimated && live?.loading
 ? "Estimated from available signals while the completed listings are counted. If enough of them state a sale date, this is replaced by the real ones."
 : sold?.estimated
 ? "Estimated from available signals — connect a marketplace for verified counts. Not enough completed listings stated a sale date to plot the real ones, so the total is an estimate and the curve models the trend direction, not counted daily sales."
 : ""}
 </p>
 <div style={{ marginTop: 12, fontSize: 13, color: C.dim }}>
 Recent sold price: <span style={{ color: C.bone, fontWeight: 700, fontFamily: MONO }}>
 {item.comp > 0 ? money0(item.comp) : "Not available"}</span>
 </div>
 </div>
 )}

 <div style={{ ...card, marginTop: 10 }}>
 <div style={{ ...label, marginBottom: 10 }}>What We Analyzed</div>
 <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
 {demandLabel(item.vel) === "High" ? "Demand looks strong right now. " : demandLabel(item.vel) === "Low" ? "Demand looks quiet right now. " : "Demand looks moderate right now. "}
 {compLabel(item.sellers) === "High" ? `Competition is on the higher side — around ${item.sellers ?? "many"} sellers. ` : "Competition looks manageable. "}
 {item.trend === "up" ? "The trend has been climbing recently." : item.trend === "down" ? "The trend has been softening recently." : "The trend has been steady."}
 {" "}Recommended: {kind === "Local" ? "check local pickup marketplaces first" : "list on a search-heavy marketplace like eBay"}.
 </p>
 </div>

 {related.length > 0 && (
 <div style={{ marginTop: 16 }}>
 <div style={{ ...label, margin: "0 4px 10px" }}>Related products</div>
 {related.map((r) => (
 <div key={r.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 4px", borderBottom: `1px solid ${C.line}` }}>
 <span style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
 <TrendIcon trend={r.trend} />
 </div>
 ))}
 </div>
 )}

 <div style={{ ...label, margin: "18px 4px 10px" }}>Sources</div>
 <Wrap>
 {["ebay", "mercari", "poshmark", "offerup", "facebook"].map((k) => {
 const m = MARKETS[k];
 return (
 <a key={k} href={m.url(item.title, db.profile)} target="_blank" rel="noopener noreferrer" className="lnk"
 style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "7px 12px", borderRadius: 999, color: m.sold ? C.bone : C.dim, border: `1px solid ${m.sold ? C.accentDim : C.line}`, textDecoration: "none" }}>
 {m.label}{m.sold && <span style={{ fontFamily: MONO, fontSize: 9, color: C.accentText }}>SOLD</span>}
 <ExternalLink size={10} />
 </a>
 );
 })}
 </Wrap>

 <button onClick={() => setShowCost(!showCost)} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", marginTop: 18, padding: "14px", fontWeight: 700 }}>
 {showCost ? "Hide cost" : "Add Your Cost"}
 </button>

 {showCost && (
 <div className="rise" style={{ ...card, marginTop: 10 }}>
 <div style={{ ...label, marginBottom: 10 }}>What would you pay?</div>
 <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999, padding: "0 16px" }}>
 <span style={{ fontFamily: MONO, fontSize: 18, color: C.dim }}>$</span>
 <input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)}
 placeholder="0.00" style={{ flex: 1, background: "none", border: "none", color: C.bone, outline: "none", fontFamily: MONO, fontSize: 18, fontWeight: 600, padding: "14px 0" }} />
 </div>
 {calc && (
 <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 <MiniLine l="Sold price used" v={item.comp} />
 <MiniLine l="Your cost" v={-c} />
 <MiniLine l={`Fees ${s.feePct}% + ${s.payPct}% + $${s.ship} ship`} v={-(calc.fees + s.ship)} />
 <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8 }}>
 <MiniLine l="Estimated profit" v={calc.profit} bold />
 </div>
 <p style={{ fontSize: 11, color: C.dead, margin: "10px 0 0" }}>
 Margin {calc.margin.toFixed(0)}% · ROI {calc.roi.toFixed(0)}% — estimated, not guaranteed.
 </p>
 </div>
 )}
 </div>
 )}

 <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
 <button onClick={save} className="fx fx-chip" style={{ ...pillBtn(saved), flex: 1, padding: "14px 0", fontWeight: 700 }}>
 {saved ? "Saved ✓" : "Save to watchlist"}
 </button>
 </div>
 </Sheet>
 );
}
const Mini = ({ l, v }) => (
 <div style={{ ...card, padding: 12 }}>
 <div style={{ fontSize: 10.5, color: C.dim, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{l}</div>
 <div style={{ fontSize: 15, fontWeight: 700, marginTop: 5 }}>{v}</div>
 </div>
);

function Saturation({ db, go, put }) {
 const [mode, setMode] = useState("online");
 const [cat, setCat] = useState("All");
 const [ticket, setTicket] = useState("all");
 const [alt, setAlt] = useState(null);
 const [altList, setAltList] = useState([]);
 const [detail, setDetail] = useState(null);

 /* The mode chip used to be decorative: both tabs read from CATALOG, so
    Online and Local showed the same four products. They are different
    businesses and now read from different lists. */
 const source = mode === "local" ? LOCAL_CATALOG : CATALOG;
 const pool = source.filter((c) => (cat === "All" || c.cat === cat) && (ticket === "all" || TICKET(c.comp) === ticket));
 /* Wider slices than before, because there is finally enough in each
    category to rank — four out of six was most of the list, which is why
    every section looked like the same handful of products. */
 const crowded = [...pool].sort((a, b) => b.sellers - a.sellers).slice(0, 6);
 const rising = crowded.filter((c) => c.trend !== "down").slice(0, 4);
 const falling = [...pool].filter((c) => c.trend === "down").slice(0, 4);
 const open = [...pool].sort((a, b) => a.sellers - b.sellers).slice(0, 5);

 const showAlt = async (item) => {
 if (alt === item.title) { setAlt(null); return; }
 setAlt(item.title); setAltList(await SearchProvider.findSimilarProducts(item, pool));
 };

 return (
 <div style={{ paddingTop: 4 }}>
 <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
 {[["online", "Online", Globe], ["local", "Local", MapPin]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => setMode(k)} className="fx fx-chip"
 style={{ ...pillBtn(mode === k), display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
 <Icon size={14} /> {n}
 </button>
 ))}
 </div>
 {/* This used to read "Based on 30106, 25 mile radius", which claimed
     these figures had been measured in that ZIP. They have not been —
     they are reference figures for what tends to move locally. Saying so
     costs a sentence; the alternative is a number the app cannot stand
     behind. Searching runs against the real radius. */}
 {mode === "local" && (
 <p style={{ fontSize: 12.5, color: C.dim, margin: "0 4px 12px", lineHeight: 1.5 }}>
 What tends to move locally — bulky things shipping makes uneconomic. Figures
 are estimates, not measured for {db.profile.zip || db.profile.state || "your area"};
 searches use your {db.profile.radius} mile radius.
 </p>
 )}

 <Wrap>
 <button onClick={() => setCat("All")} className="fx fx-chip" style={{ ...pillBtn(cat === "All"), padding: "6px 12px", fontSize: 11.5 }}>All</button>
 {CATEGORIES.map((c) => (
 <button key={c.key} onClick={() => setCat(c.key)} className="fx fx-chip"
 style={{ ...pillBtn(cat === c.key), padding: "6px 12px", fontSize: 11.5 }}>{c.key}</button>
 ))}
 </Wrap>
 <div style={{ display: "flex", gap: 8, margin: "9px 0 18px" }}>
 {[["all", "Any ticket"], ["low", "Low Ticket"], ["high", "High Ticket"]].map(([k, n]) => (
 <button key={k} onClick={() => setTicket(k)} className="fx fx-chip"
 style={{ ...pillBtn(ticket === k), flex: 1, padding: "8px 0", fontSize: 12 }}>{n}</button>
 ))}
 </div>

 {pool.length === 0 && (
 <p style={{ fontSize: 13, color: C.dead, margin: "0 4px 20px" }}>Nothing in this category/ticket combination yet.</p>
 )}

 <Section title="Most oversaturated">
 {crowded.map((c, i) => (
 <SatRow key={c.title} item={c} idx={i} altOpen={alt === c.title} altList={altList}
 onAlt={() => showAlt(c)} onMore={() => setDetail(c)} />
 ))}
 </Section>

 <Section title="Competition increasing">
 {rising.map((c, i) => <SatRow key={c.title} item={c} idx={i} onMore={() => setDetail(c)} compact />)}
 </Section>

 <Section title="Competition falling">
 {falling.length === 0 && <p style={{ fontSize: 12.5, color: C.dead, margin: "0 4px" }}>Nothing notable right now.</p>}
 {falling.map((c, i) => <SatRow key={c.title} item={c} idx={i} onMore={() => setDetail(c)} compact />)}
 </Section>

 <Section title="Low competition opportunities">
 {open.map((c, i) => <SatRow key={c.title} item={c} idx={i} onMore={() => setDetail(c)} compact />)}
 </Section>

 <p style={{ fontSize: 11.5, color: C.dead, margin: "6px 4px 0", lineHeight: 1.6 }}>
 Built from reference market data. Seller counts become live once a marketplace account is connected.
 </p>

 {/* `put` used to be a no-op here, so "Save to watchlist" on a Saturation
     product did nothing at all and the product never reached Saved. */}
 {detail && <ProductDetailSheet item={detail} db={db} put={put} onClose={() => setDetail(null)} />}
 </div>
 );
}

const Section = ({ title, children }) => (
 <div style={{ marginBottom: 22 }}>
 <div style={{ ...label, margin: "0 4px 10px" }}>{title}</div>
 {children}
 </div>
);

function SatRow({ item, idx, onAlt, onMore, altOpen, altList, compact }) {
 return (
 <div className="rise" style={{ ...rise(idx), ...card, borderRadius: 16, marginBottom: 8 }}>
 <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{item.title}</div>
 <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim, marginTop: 5 }}>
 ~{item.sellers} sellers · {item.vel}/wk
 </div>
 <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: VERDICT_COLOR[verdict(item).tone], marginTop: 5 }}>
 {verdict(item).label}
 </div>
 </div>
 <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
 <TrendIcon trend={item.trend} />
 <button onClick={onMore} className="fx fx-chip" style={{ ...pillBtn(false), padding: "6px 12px", fontSize: 11.5 }}>See More</button>
 </div>
 </div>
 {!compact && onAlt && (
 <>
 <button onClick={onAlt} className="fx fx-chip" style={{ ...pillBtn(false), marginTop: 11, padding: "7px 14px", fontSize: 12 }}>
 {altOpen ? "Hide alternatives" : "Show alternatives"}
 </button>
 {altOpen && (
 <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 <div style={{ fontSize: 12, color: C.dim, marginBottom: 9 }}>Consider these instead</div>
 {altList.length === 0 && <p style={{ fontSize: 12.5, color: C.dead, margin: 0 }}>No close matches in this category yet.</p>}
 {altList.map((o) => (
 <div key={o.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0" }}>
 <span style={{ fontSize: 13, fontWeight: 600 }}>{o.title}</span>
 <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>{o.sellers} sellers</span>
 </div>
 ))}
 </div>
 )}
 </>
 )}
 </div>
 );
}

function Business({ db, biz, put, range, setRange, jump, requirePro, isPro }) {
 /* Same rule as the tab row above: a locked chip explains itself and
    leaves you on the one you were already reading. */
 const pick = (k) => { if (k === "listing" && !requirePro("listing")) return; setSub(k); };
 const allowed = (k) => (k === "listing" && !isPro ? "inventory" : k);
 const [sub, setSub] = useState(allowed(jump?.sub || "inventory"));
 /* A jump arrives from elsewhere in the app rather than from a click, so it
    has to pass the same check — otherwise any future deep link into Listing
    would be a way around the chip. */
 useEffect(() => { if (jump?.sub) setSub(allowed(jump.sub)); }, [jump]);
 return (
 <div style={{ paddingTop: 4 }}>
 <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto" }}>
 {[["inventory", "Inventory", Package], ["sales", "Sales", TrendingUp],
 ["calc", "Calculator", CalcIcon], ["listing", "Listing", FileText],
 ["essentials", "Essentials", Wrench]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => pick(k)} className="fx fx-chip"
 style={{ ...pillBtn(sub === k), display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, whiteSpace: "nowrap" }}>
 <Icon size={14} /> {n}
 </button>
 ))}
 </div>
 {sub === "inventory" && <Inventory db={db} put={put} />}
 {sub === "sales" && <Sales db={db} biz={biz} range={range} setRange={setRange} />}
 {sub === "calc" && <Calculator s={db.settings} />}
 {sub === "listing" && <GenerateListing />}
 {sub === "essentials" && <Essentials />}
 </div>
 );
}

function restockHint(title, soldCount) {
 const ref = CATALOG.find((c) => c.title === title);
 if (!ref || soldCount === 0) return { label: "Not enough data", tone: "neutral" };
 const v = verdict(ref);
 if (v.tone === "neutral") return { label: "Not enough data", tone: "neutral" };
 return v.tone === "good" ? { label: "Consider restocking", tone: "good" } : { label: "Do not restock yet", tone: "bad" };
}

/* Section heading that doubles as the control for its own list. The plain
   text gave no sign the group could be put away, so the chevron is the
   whole point: it says "this opens and closes" before anyone clicks it.
   Count sits next to the name so a closed section still tells you how
   much is inside. */
function StockHeading({ children, count, open, onToggle }) {
 return (
 <button onClick={onToggle} aria-expanded={open} className="stock-head"
   style={{ ...label, display: "flex", alignItems: "center", gap: 8, width: "100%",
     background: "none", border: "none", cursor: "pointer", padding: 0,
     fontFamily: SANS, textAlign: "left", transition: "color .16s" }}>
 {children}
 <span style={{ fontFamily: MONO, color: C.dead, fontWeight: 600 }}>{count}</span>
 {/* Points down when the list is showing, right when it's closed — the
     same direction the content sits in. */}
 <ChevronDown size={14} aria-hidden="true" style={{
   marginLeft: "auto", flexShrink: 0,
   transform: open ? "none" : "rotate(-90deg)",
   transition: "transform .18s cubic-bezier(.2,.7,.3,1)",
 }} />
 </button>
 );
}

function Inventory({ db, put }) {
 const [add, setAdd] = useState(false);
 const [sell, setSell] = useState(null);
 const [openSoldOut, setOpenSoldOut] = useState(null);
 /* Both open on arrival, so the screen looks the same as it always did
    until someone chooses to collapse a group. */
 const [showAvail, setShowAvail] = useState(true);
 const [showSold, setShowSold] = useState(true);

 const addItem = async (it) => {
 const item = { ...it, id: `inv_${Date.now()}`, unitsLeft: it.units,
 addedAt: it.purchaseDate || new Date().toISOString(), soldOutAt: null };
 await put("inventory", [item, ...db.inventory]);
 setAdd(false);
 };
 const logSale = async (sale) => {
 await put("sales", [sale, ...db.sales]);
 await put("inventory", db.inventory.map((i) => {
 if (i.id !== sale.itemId) return i;
 const unitsLeft = Math.max(0, i.unitsLeft - sale.qty);
 const justSoldOut = unitsLeft === 0 && i.unitsLeft > 0;
 return { ...i, unitsLeft, soldOutAt: justSoldOut ? new Date().toISOString() : i.soldOutAt };
 }));
 setSell(null);
 };

 const available = db.inventory.filter((i) => i.unitsLeft > 0);
 const soldOut = db.inventory.filter((i) => i.unitsLeft === 0);

 if (!db.inventory.length && !add) return <Empty icon="📦" title="No inventory yet"
 body="Add your first product to start tracking units and cost." cta="Add product" onCta={() => setAdd(true)} />;

 return (
 <div>
 <button onClick={() => setAdd(true)} className="fx fx-accent"
 style={{ width: "100%", padding: "14px", border: "none", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700, background: C.accent, color: C.onAccent, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
 <Plus size={17} /> Add product
 </button>

 {available.length > 0 && (
 <div style={{ margin: "0 4px 10px" }}>
 <StockHeading count={available.length} open={showAvail} onToggle={() => setShowAvail(!showAvail)}>
 Available stock
 </StockHeading>
 </div>
 )}
 {showAvail && available.map((i, idx) => {
 const sold = db.sales.filter((x) => x.itemId === i.id);
 const age = Math.floor((Date.now() - new Date(i.addedAt)) / 864e5);
 return (
 <div key={i.id} className="rise" style={{ ...rise(idx), ...card, borderRadius: 16, marginBottom: 8 }}>
 <div style={{ display: "grid", gap: 3 }}>
 <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
 <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
 {i.unitsLeft} of {i.units} left · cost {money0(i.cost)} ea · {age}d old
 </div>
 {i.notes && <div style={{ fontSize: 12, color: C.dead }}>{i.notes}</div>}
 </div>
 <Bar pct={((i.units - i.unitsLeft) / i.units) * 100} />
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
 <span style={{ fontSize: 11.5, color: C.dead }}>
 {sold.length ? `${sold.length} sale${sold.length > 1 ? "s" : ""} logged` : "No sales logged"}
 </span>
 <button onClick={() => setSell(i)} className="fx fx-chip" style={{ ...pillBtn(false), padding: "7px 14px", fontSize: 12 }}>
 Log a sale
 </button>
 </div>
 </div>
 );
 })}

 {soldOut.length > 0 && (
 <div style={{ margin: "20px 4px 10px" }}>
 <StockHeading count={soldOut.length} open={showSold} onToggle={() => setShowSold(!showSold)}>
 Sold out stock
 </StockHeading>
 </div>
 )}
 {showSold && soldOut.map((i, idx) => {
 const sold = db.sales.filter((x) => x.itemId === i.id);
 const revenue = sold.reduce((a, x) => a + x.amount, 0);
 const profit = sold.reduce((a, x) => a + x.profit, 0);
 const unitsSold = sold.reduce((a, x) => a + x.qty, 0);
 const hint = restockHint(i.title, sold.length);
 const isOpen = openSoldOut === i.id;
 return (
 <div key={i.id} className="rise" style={{ ...rise(idx), ...card, borderRadius: 16, marginBottom: 8, opacity: 0.92 }}>
 <button onClick={() => setOpenSoldOut(isOpen ? null : i.id)}
 style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
 <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3 }}>{i.title}</div>
 <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: VERDICT_COLOR[hint.tone], whiteSpace: "nowrap" }}>
 {hint.label}
 </span>
 </div>
 <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim, marginTop: 5 }}>
 {i.units} bought · {unitsSold} sold · {money0(profit)} profit
 </div>
 </button>
 {isOpen && (
 <div className="rise" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 <Row l="Original quantity" r={i.units} />
 <Row l="Date added" r={new Date(i.addedAt).toLocaleDateString()} />
 <Row l="Date sold out" r={i.soldOutAt ? new Date(i.soldOutAt).toLocaleDateString() : "—"} />
 <Row l="Units sold" r={unitsSold} />
 <Row l="User-entered cost" r={money0(i.cost)} />
 <Row l="Revenue" r={money0(revenue)} />
 <Row l="Profit" r={money0(profit)} />
 <Row l="Current demand" r={demandLabel(CATALOG.find((c) => c.title === i.title)?.vel)} />
 <Row l="Current saturation" r={satLabel(CATALOG.find((c) => c.title === i.title)?.vel, CATALOG.find((c) => c.title === i.title)?.sellers)} />
 </div>
 )}
 </div>
 );
 })}

 {add && <AddSheet onClose={() => setAdd(false)} onSave={addItem} />}
 {sell && <SellSheet item={sell} s={db.settings} onClose={() => setSell(null)} onSave={logSale} />}
 </div>
 );
}

function AddSheet({ onClose, onSave }) {
 const [f, setF] = useState({ title: "", units: 1, cost: "", purchaseDate: new Date().toISOString().slice(0, 10), notes: "" });
 const ok = f.title.trim() && +f.cost > 0 && +f.units > 0 && validDate(f.purchaseDate);
 return (
 <Sheet title="Add product" onClose={onClose}>
 <Field label="What is it?" value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="Dior Sauvage EDT 100ml" />
 <div style={{ display: "flex", gap: 9 }}>
 <Field label="How many?" value={f.units} type="number" onChange={(v) => setF({ ...f, units: v })} />
 <Field label="Cost per unit" value={f.cost} type="number" prefix="$" onChange={(v) => setF({ ...f, cost: v })} />
 </div>
 <Field label="Purchase date" value={f.purchaseDate} type="date" onChange={(v) => setF({ ...f, purchaseDate: v })} />
 <Field label="Notes (optional)" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} placeholder="Bought as a lot of 3" />
 <Primary label="Add to inventory" disabled={!ok}
 onClick={() => onSave({ title: f.title.trim(), units: +f.units, cost: +f.cost,
 purchaseDate: localMidnight(f.purchaseDate).toISOString(), notes: f.notes.trim() })} />
 <Note>Where you'll sell it and for how much come later, when you log the actual sale.</Note>
 </Sheet>
 );
}

function SellSheet({ item, s, onClose, onSave }) {
 const [method, setMethod] = useState(null); // null | "meetup" | "shipping"
 const [f, setF] = useState({ qty: 1, amount: "", market: "ebay", feePct: s.feePct, ship: s.ship, other: 0,
 soldAt: new Date().toISOString().slice(0, 10) });
 const amt = +f.amount || 0;
 const isMeetup = method === "meetup";
 const calc = profitFrom({
 sell: amt, cost: item.cost * f.qty,
 feePct: isMeetup ? 0 : f.feePct, ship: isMeetup ? 0 : +f.ship, other: +f.other,
 });
 const ok = method && amt > 0 && +f.qty > 0 && +f.qty <= item.unitsLeft && validDate(f.soldAt);

 if (!method) {
 return (
 <Sheet title="How was it sold?" sub={item.title} onClose={onClose}>
 <div style={{ display: "grid", gap: 10 }}>
 <button onClick={() => setMethod("meetup")} className="fx fx-card"
 style={{ ...card, borderRadius: 18, cursor: "pointer", textAlign: "left", color: C.bone }}>
 <div style={{ fontSize: 15, fontWeight: 700 }}>Meetup</div>
 <div style={{ fontSize: 12.5, color: C.dim, marginTop: 5 }}>Cash or local handoff — no shipping, no platform fee field.</div>
 </button>
 <button onClick={() => setMethod("shipping")} className="fx fx-card"
 style={{ ...card, borderRadius: 18, cursor: "pointer", textAlign: "left", color: C.bone }}>
 <div style={{ fontSize: 15, fontWeight: 700 }}>Shipping</div>
 <div style={{ fontSize: 12.5, color: C.dim, marginTop: 5 }}>Marketplace sale — fees, shipping and marketplace tracked.</div>
 </button>
 </div>
 </Sheet>
 );
 }

 return (
 <Sheet title="Log a sale" sub={`${item.title} · ${isMeetup ? "Meetup" : "Shipping"}`} onClose={onClose}>
 <div style={{ display: "flex", gap: 9 }}>
 <Field label={`Quantity (max ${item.unitsLeft})`} value={f.qty} type="number" onChange={(v) => setF({ ...f, qty: v })} />
 <Field label="Sale amount" value={f.amount} type="number" prefix="$" onChange={(v) => setF({ ...f, amount: v })} />
 </div>

 {isMeetup ? (
 <Field label="Other expenses (optional)" value={f.other} type="number" prefix="$" onChange={(v) => setF({ ...f, other: v })} />
 ) : (
 <>
 <div style={{ ...label, margin: "12px 0 9px" }}>Marketplace</div>
 <Wrap>{[...ONLINE, ...LOCAL].map((m) => (
 <button key={m} onClick={() => setF({ ...f, market: m })} className="fx fx-chip"
 style={{ ...pillBtn(f.market === m), padding: "7px 13px", fontSize: 12 }}>{MARKETS[m].label}</button>
 ))}</Wrap>
 <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
 <Field label="Platform fee %" value={f.feePct} type="number" onChange={(v) => setF({ ...f, feePct: v })} />
 <Field label="Shipping" value={f.ship} type="number" prefix="$" onChange={(v) => setF({ ...f, ship: v })} />
 </div>
 <Field label="Other expenses" value={f.other} type="number" prefix="$" onChange={(v) => setF({ ...f, other: v })} />
 </>
 )}
 <Field label="Sale date" value={f.soldAt} type="date" onChange={(v) => setF({ ...f, soldAt: v })} />

 <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
 <MiniLine l="Revenue" v={amt} />
 <MiniLine l="Product cost" v={-item.cost * f.qty} />
 {!isMeetup && <MiniLine l="Fees" v={-calc.fees} />}
 {!isMeetup && <MiniLine l="Shipping" v={-(+f.ship)} />}
 <MiniLine l="Other expenses" v={-(+f.other)} />
 <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 8 }}>
 <MiniLine l="Net profit" v={calc.profit} bold />
 </div>
 </div>

 <Primary label="Log sale" disabled={!ok} onClick={() => onSave({
 id: `sale_${Date.now()}`, itemId: item.id, title: item.title, qty: +f.qty, amount: amt,
 cost: item.cost * f.qty, fees: calc.fees, other: +f.other, profit: calc.profit,
 market: isMeetup ? "meetup" : f.market, method, soldAt: localMidnight(f.soldAt).toISOString(),
 })} />
 <button onClick={() => setMethod(null)} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", marginTop: 9, padding: "10px 0", fontSize: 12 }}>
 Back
 </button>
 </Sheet>
 );
}

function Sales({ db, biz, range, setRange }) {
 if (!db.sales.length) return <Empty icon="📊" title="No sales logged yet"
 body="Log your first sale from Inventory and this dashboard fills in." />;
 return (
 <div>
 <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
 {[["today", "Today"], ["7", "7 Days"], ["30", "30 Days"], ["all", "All Time"]].map(([k, n]) => (
 <button key={k} onClick={() => setRange(k)} className="fx fx-chip" style={{ ...pillBtn(range === k), padding: "7px 13px", fontSize: 12 }}>{n}</button>
 ))}
 </div>
 <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
 <Stat label="Revenue" value={money0(biz.revenue)} />
 <Stat label="Net profit" value={money0(biz.profit)} accent />
 <Stat label="Items sold" value={biz.itemsSold} />
 <Stat label="Avg profit / sale" value={money0(biz.itemsSold ? biz.profit / biz.itemsSold : 0)} />
 </div>

 {/* Same component as the home screen, reading the same range state, so the
     chart, the stats above it and the filter always agree. */}
 <div className="rise" style={{ ...card, marginTop: 12 }}>
 <div style={{ ...label, marginBottom: 13 }}>Revenue vs profit</div>
 <TrendChart sales={db.sales} range={range} />
 </div>
 {(biz.bestMarket || biz.bestProduct) && (
 <div style={{ ...card, marginTop: 12 }}>
 {biz.bestMarket && <Row l="Best marketplace" r={marketLabel(biz.bestMarket[0])} />}
 {biz.bestProduct && <Row l="Best product" r={biz.bestProduct[0]} />}
 </div>
 )}
 <Note>All figures are self-reported from what you logged. Connecting eBay makes them verified.</Note>
 </div>
 );
}

function Calculator({ s }) {
 const [buy, setBuy] = useState("");
 const [sell, setSell] = useState("");
 const [adv, setAdv] = useState(false);
 const [x, setX] = useState({ fee: s.feePct, pay: s.payPct, ship: s.ship, other: 0 });
 const b = +buy || 0, v = +sell || 0;
 const calc = profitFrom({ sell: v, cost: b, feePct: x.fee, pay: x.pay, ship: +x.ship, other: +x.other });
 const live = b > 0 && v > 0;

 return (
 <div>
 <Field label="What did you pay?" value={buy} type="number" prefix="$" onChange={setBuy} big />
 <Field label="What will you sell it for?" value={sell} type="number" prefix="$" onChange={setSell} big />
 {live && (
 <div className="rise" style={{ ...card, borderRadius: 22, marginTop: 16, textAlign: "center", padding: 24, borderColor: calc.profit > 0 ? C.accentDim : C.line }}>
 <div style={{ ...label, color: calc.profit > 0 ? C.accent : C.dead }}>You could make</div>
 <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 600, margin: "10px 0 4px", color: calc.profit > 0 ? C.accent : C.dead }}>
 {money0(calc.profit)}
 </div>
 <div style={{ fontSize: 12, color: C.dead }}>estimated profit</div>
 <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
 <div style={{ flex: 1, background: C.raised, borderRadius: 14, padding: 13 }}>
 <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600 }}>{calc.margin.toFixed(0)}%</div>
 <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>of the sale price</div>
 </div>
 <div style={{ flex: 1, background: C.raised, borderRadius: 14, padding: 13 }}>
 <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600 }}>{calc.roi.toFixed(0)}%</div>
 <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>return on your cash</div>
 </div>
 </div>
 </div>
 )}
 <button onClick={() => setAdv(!adv)} className="fx fx-chip" style={{ ...pillBtn(false), marginTop: 14, padding: "10px 17px", fontSize: 12.5 }}>
 {adv ? "Hide costs" : "See details"}
 </button>
 {adv && (
 <div className="rise" style={{ ...card, marginTop: 10 }}>
 <Num l="Marketplace fee" suffix="%" v={x.fee} set={(n) => setX({ ...x, fee: n })} step={0.25} />
 <Num l="Payment processing" suffix="%" v={x.pay} set={(n) => setX({ ...x, pay: n })} step={0.1} />
 <Num l="Shipping" prefix="$" v={x.ship} set={(n) => setX({ ...x, ship: n })} />
 <Num l="Anything else" prefix="$" v={x.other} set={(n) => setX({ ...x, other: n })} />
 </div>
 )}
 {!live && <p style={{ fontSize: 13, color: C.dim, margin: "20px 4px", lineHeight: 1.6 }}>Put in both numbers and profit updates as you type.</p>}
 </div>
 );
}

async function generateListingText(title, cond, market) {
 const text = await askClaude([{ role: "user", content:
`Write a resale listing for: "${title}". Condition: ${cond || "not specified"}. Target marketplace: ${MARKETS[market]?.label || market}.

Return ONLY JSON, no fences:
{"title":"under 80 chars, keyword-front-loaded","description":"3 short paragraphs, plain language","keywords":["8 search terms"],"category":"best-fit category"}

${["depop"].includes(market) ? "Style-led and casual — this audience shops for the look." : "Keyword and search led — buyers here use the search bar."}
Never include a price anywhere in the output.` }]);
 const clean = text.replace(/```json|```/g, "").trim();
 const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
 if (a === -1 || b === -1) throw new Error("Couldn't generate a listing. Try again.");
 const parsed = JSON.parse(clean.slice(a, b + 1));
 return { ...parsed, title: stripPrices(parsed.title), description: stripPrices(parsed.description) };
}

function GenerateListing() {
 const [title, setTitle] = useState("");
 const [cond, setCond] = useState("");
 const [market, setMarket] = useState("ebay");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState(null);
 const [out, setOut] = useState(null);

 const run = async () => {
 if (!title.trim()) return;
 setBusy(true); setErr(null); setOut(null);
 try { setOut(await generateListingText(title.trim(), cond.trim(), market)); }
 catch (e) { setErr(e.message); } finally { setBusy(false); }
 };

 return (
 <div>
 <Field label="What are you listing?" value={title} onChange={setTitle} placeholder="Jordan 4 Black Cat, size 10.5" big />
 <Field label="Condition (optional)" value={cond} onChange={setCond} placeholder="New with box, worn twice…" />
 <div style={{ ...label, margin: "4px 0 9px" }}>Marketplace</div>
 <Wrap>{[...ONLINE, ...LOCAL].map((m) => (
 <button key={m} onClick={() => setMarket(m)} className="fx fx-chip"
 style={{ ...pillBtn(market === m), padding: "7px 13px", fontSize: 12 }}>{MARKETS[m].label}</button>
 ))}</Wrap>
 <Primary label={busy ? "Writing…" : "Generate listing"} disabled={busy || !title.trim()} onClick={run} />
 {err && <p style={{ fontSize: 12.5, color: C.accentText, marginTop: 12, fontWeight: 600 }}>{err}</p>}
 {busy && <div style={{ marginTop: 14, display: "grid", gap: 8 }}>{[0,1,2].map((i) => <div key={i} className="skel" style={{ height: 18 }} />)}</div>}
 {out && (
 <div className="rise" style={{ ...card, marginTop: 16 }}>
 <div style={{ ...label, color: C.accentText, marginBottom: 10 }}>Draft listing</div>
 <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35 }}>{out.title}</div>
 <div style={{ fontFamily: MONO, fontSize: 12, color: C.dim, margin: "8px 0 12px" }}>{out.category}</div>
 <p style={{ fontSize: 13, lineHeight: 1.6, color: C.dim, whiteSpace: "pre-wrap", margin: 0 }}>{out.description}</p>
 {out.keywords?.length > 0 && (
 <div style={{ marginTop: 12 }}>
 <Wrap>{out.keywords.slice(0, 8).map((k) => (
 <span key={k} style={{ fontSize: 11, color: C.dim, padding: "4px 9px", border: `1px solid ${C.line}`, borderRadius: 999 }}>{k}</span>
 ))}</Wrap>
 </div>
 )}
 <button onClick={() => navigator.clipboard?.writeText(`${out.title}\n\n${out.description}\n\n${(out.keywords || []).join(", ")}`)}
 className="fx fx-chip" style={{ ...pillBtn(false), marginTop: 14, padding: "9px 16px", fontSize: 12.5 }}>
 Copy listing
 </button>
 <Note>Never includes a price — pricing is yours to set when you list it.</Note>
 </div>
 )}
 </div>
 );
}

function Essentials() {
 const groups = [...new Set(ESSENTIALS.map((e) => e.cat))];
 return (
 <div>
 {groups.map((g) => (
 <div key={g} style={{ marginBottom: 22 }}>
 <div style={{ ...label, margin: "0 4px 10px" }}>{g}</div>
 {ESSENTIALS.filter((e) => e.cat === g).map((e) => (
 <div key={e.name} className="rise fx-card" style={{ ...card, borderRadius: 16, marginBottom: 8, display: "flex", gap: 13, alignItems: "center" }}>
 <Thumb size={46} />
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 14, fontWeight: 700 }}>{e.name}</div>
 <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{e.note}</div>
 </div>
 <a href={`https://www.amazon.com/s?k=${encodeURIComponent(e.name)}`} target="_blank" rel="noopener noreferrer" className="lnk"
 style={{ fontSize: 12, fontWeight: 700, padding: "8px 13px", borderRadius: 999, color: C.bone, border: `1px solid ${C.accentDim}`, textDecoration: "none", flexShrink: 0 }}>Shop</a>
 </div>
 ))}
 </div>
 ))}
 <Note>Generic search links for now — easy to swap for affiliate links later without touching the layout.</Note>
 </div>
 );
}

function SettingsPage({ db, put, reset, user, signOut, isPro, ent, refreshEntitlement, entLoading, entNote }) {
 /* null | "terms" | "privacy" */
 const [legal, setLegal] = useState(null);

 /* What is left of both hourly allowances. Only asked for on a premium
    account, because a free one has neither. Re-read whenever this screen is
    opened, so it is current rather than whatever it was at sign-in.

    Asked in parallel and reported separately: one of the two endpoints
    being unreachable should cost you that row, not both. */
 const [quotas, setQuotas] = useState({ search: null, ask: null });
 useEffect(() => {
   if (!isPro) { setQuotas({ search: null, ask: null }); return; }
   let alive = true;
   Promise.all([fetchQuota(SEARCH_FN), fetchQuota(AI_FN)])
     .then(([search, ask]) => alive && setQuotas({ search, ask }));
   return () => { alive = false; };
 }, [isPro]);
 const [closing, setClosing] = useState(false);
 const [closeErr, setCloseErr] = useState(null);

 /* Everything we hold, as a file. Built from what is on screen rather than
    re-fetched, because that is what the person is being shown and promised. */
 const exportData = () => {
   const payload = {
     exportedAt: new Date().toISOString(),
     account: { email: user?.email || null, username: db.profile?.name || null },
     profile: db.profile, settings: db.settings,
     inventory: db.inventory, sales: db.sales, watchlist: db.watchlist,
   };
   const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
   const a = document.createElement("a");
   a.href = url;
   a.download = `reamp-export-${new Date().toISOString().slice(0, 10)}.json`;
   document.body.appendChild(a); a.click(); a.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
 };

 /* Deliberately two steps and a typed confirmation. This removes the
    account and every row belonging to it, and there is no undo. */
 const deleteAccount = async () => {
   const typed = prompt('This deletes your account and everything in it. It cannot be undone.\n\nType DELETE to confirm.');
   if (typed !== "DELETE") return;
   setClosing(true); setCloseErr(null);
   try {
     const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
       method: "POST", headers: await fnHeaders(),
     });
     const d = await res.json().catch(() => ({}));
     if (!res.ok) throw new Error(d.error || `Couldn't delete the account (${res.status}).`);
     /* Clear the local copy too, or the next sign-in on this browser would
        find cached rows for an account that no longer exists. */
     await reset();
     await signOut();
   } catch (e) {
     setCloseErr(e.message || "Couldn't delete your account.");
   } finally {
     setClosing(false);
   }
 };

 return (
 <div style={{ paddingTop: 4 }}>
 <Group title="Account">
 <Row l="Signed in" r={user.email || user.username || "Demo mode"} />
 <Row l="Method" r={user.provider === "email" ? "Email + password" : user.provider === "demo" ? "Demo mode" : user.provider || "—"} />
 <Field label="Display name" value={db.profile.name} onChange={(v) => put("profile", { ...db.profile, name: v })} placeholder="Alex" />
 <button onClick={signOut} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "13px", marginTop: 6, fontWeight: 700 }}>
 Sign out
 </button>
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 10, lineHeight: 1.6 }}>
 Signing out clears your session and returns you to the landing page. Your inventory,
 sales and settings stay saved on this device.
 </p>
 </Group>

 <Group title="Appearance">
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
 {Object.entries(THEMES).map(([id, t]) => {
 const on = (db.profile.theme || "obsidian") === id;
 return (
 <button key={id} onClick={() => put("profile", { ...db.profile, theme: id })} className="fx"
 style={{ textAlign: "left", cursor: "pointer", borderRadius: 16, padding: 13, background: t.panel, border: `2px solid ${on ? t.accent : "transparent"}` }}>
 <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
 <span style={{ width: 16, height: 16, borderRadius: 999, background: t.void, border: `1px solid ${t.line}` }} />
 <span style={{ width: 16, height: 16, borderRadius: 999, background: t.accent }} />
 </div>
 <div style={{ fontSize: 13, fontWeight: 700, color: t.bone }}>{t.name}</div>
 <div style={{ fontSize: 10.5, color: t.dim, marginTop: 2 }}>{t.sub}</div>
 </button>
 );
 })}
 </div>
 </Group>

 <Group title="Location">
 <div style={{ display: "flex", gap: 8 }}>
 <select value={db.profile.state} aria-label="State" style={{ ...inputSt, flex: 1 }}
 onChange={(e) => put("profile", { ...db.profile, state: e.target.value })}>
 <option value="">State</option>{STATES.map((s) => <option key={s}>{s}</option>)}
 </select>
 <input value={db.profile.zip} inputMode="numeric" maxLength={5} placeholder="ZIP" aria-label="ZIP"
 onChange={(e) => put("profile", { ...db.profile, zip: e.target.value.replace(/\D/g, "") })}
 style={{ ...inputSt, flex: 1, fontFamily: MONO }} />
 </div>
 <div style={{ marginTop: 15 }}>
 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 8 }}>
 <span style={{ color: C.dim }}>Search radius</span>
 <span style={{ fontFamily: MONO, color: C.accentText, fontWeight: 600 }}>{db.profile.radius} mi</span>
 </div>
 <input type="range" min={5} max={100} step={5} value={db.profile.radius} aria-label="Radius"
 onChange={(e) => put("profile", { ...db.profile, radius: +e.target.value })} style={{ width: "100%", accentColor: C.accent }} />
 </div>
 </Group>

 <Group title="AI preferences">
 <Toggle label="Personalize with my business data" on={db.settings.aiUseData}
 onToggle={() => put("settings", { ...db.settings, aiUseData: !db.settings.aiUseData })} />
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 10, lineHeight: 1.6 }}>
 When on, the assistant reads your inventory, sales and location to answer specifically.
 When off, it still helps — just without your numbers.
 </p>
 </Group>

 <Group title="Backend">
 <Row l="Database" r={<Tag>profiles + watchlist, RLS on</Tag>} />
 <Row l="Product search" r={<Tag>{USE_TAVILY ? "Tavily edge fn" : "fallback"}</Tag>} />
 <Row l="Market research" r={<Tag>{USE_TAVILY ? "Tavily edge fn" : "fallback"}</Tag>} />
 <Row l="Login" r={<Tag>{DEMO ? "demo mode" : "live"}</Tag>} />
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 10, lineHeight: 1.6 }}>
 The database and both Tavily functions are live on Supabase. The edge functions
 require a signed-in user, so until real login is wired up, search falls back to
 web search directly. Every result is tagged with which path produced it.
 </p>
 </Group>

 <Group title="Selling accounts">
 {[...ONLINE, ...LOCAL].slice(0, 5).map((m) => (
 <Row key={m} l={MARKETS[m].label} r={<Tag>{MARKETS[m].hasApi ? "API available" : "manual only"}</Tag>} />
 ))}
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 10, lineHeight: 1.6 }}>
 Nothing connected yet. eBay's API is the realistic first connection — it's what turns
 self-reported sales into verified ones.
 </p>
 </Group>

 <Group title="Notifications">
 {[["opps", "New opportunities"], ["satur", "Saturation changes"], ["demand", "Demand shifts"], ["local", "Local activity"]].map(([k, n]) => (
 <Toggle key={k} label={n} on={db.settings.notif[k]}
 onToggle={() => put("settings", { ...db.settings, notif: { ...db.settings.notif, [k]: !db.settings.notif[k] } })} />
 ))}
 </Group>

 {/* What is left of this hour's searches.

     A limit you cannot see is indistinguishable from the app being broken:
     you press search, nothing happens, and there is no way to find out why.
     Shown only on a premium account, and only when the server actually
     answered — an invented number would be worse than none. */}
 {isPro && (quotas.search || quotas.ask) && (
 <Group title="Usage">
 {[["Product searches", quotas.search, "searches"],
   ["Assistant questions", quotas.ask, "questions"]]
   .filter(([, q]) => q)
   .map(([label, q, noun], i) => (
 <div key={label} style={{ marginTop: i ? 18 : 0 }}>
 <Row l={label} r={`${q.remaining} of ${q.limit} left`} />
 <div style={{ height: 6, borderRadius: 999, background: C.raised, overflow: "hidden", marginTop: 4 }}>
 <div style={{ height: "100%", borderRadius: 999,
   width: `${Math.round((q.remaining / Math.max(1, q.limit)) * 100)}%`,
   background: q.remaining === 0 ? C.dead : C.accent, transition: "width .3s" }} />
 </div>
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 8, lineHeight: 1.6 }}>
 {q.remaining === 0
   ? `You've used this hour's ${noun}.`
   : `You've used ${q.used} this hour.`}
 {q.resetsAt
   ? ` Resets at ${new Date(q.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
   : " The full allowance is available."}
 </p>
 </div>
 ))}
 </Group>
 )}

 <Group title="Billing">
 <Row l="Plan" r={isPro ? "Premium" : "Free"} />
 {isPro && ent.expiresAt && (
 <Row l="Renews / expires" r={new Date(ent.expiresAt).toLocaleDateString()} />
 )}

 {!isPro && (
 <>
 <button onClick={openCheckout} className="fx fx-accent"
 style={{ width: "100%", marginTop: 10, padding: "14px", border: "none", borderRadius: 999,
   cursor: "pointer", fontSize: 14, fontWeight: 700, background: C.accent, color: C.onAccent,
   display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
 <Sparkles size={16} /> Upgrade to premium
 </button>
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 10, lineHeight: 1.6 }}>
 Premium unlocks the AI assistant, AI Discover and Product Search. Payment
 is handled by Stripe — this app never sees your card. Your account is
 upgraded as soon as the payment goes through; if it hasn't appeared after
 a minute, press the button below.
 </p>
 </>
 )}

 {/* Manual activation means someone can be paid-up before the app knows it.
     This is how they check without having to guess when to reload. */}
 <button onClick={refreshEntitlement} disabled={entLoading} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "12px", marginTop: 10, fontWeight: 700,
   cursor: entLoading ? "wait" : "pointer" }}>
 {entLoading ? "Checking…" : isPro ? "Re-check my plan" : "I've paid — check again"}
 </button>

 {/* What the check found. A button that can only ever leave the screen
     unchanged is indistinguishable from a broken one. */}
 {entNote && (
 <p role="status" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6,
   color: isPro ? C.dim : C.accent }}>
 {entNote}
 </p>
 )}

 <Field label="Starting balance" value={db.settings.startingBalance} type="number" prefix="$"
 onChange={(v) => put("settings", { ...db.settings, startingBalance: +v || 0 })} />
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 6, lineHeight: 1.6 }}>
 Current Balance on Home = this number + realized profit from every sale you've logged.
 Card details are entered on Stripe, never here.
 </p>
 </Group>

 <Group title="Privacy & security">
 <button onClick={exportData} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "13px", fontWeight: 700 }}>
 Export my data
 </button>
 <p style={{ fontSize: 11, color: C.dead, margin: "8px 0 14px", lineHeight: 1.55 }}>
 Everything we hold about you, as a file you can keep.
 </p>

 <button onClick={() => { if (confirm("Erase all your data? Your account stays, but your inventory, sales and watchlist are removed. This can't be undone.")) reset(); }} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "13px", borderColor: C.accentDim, color: C.accentText, fontWeight: 700 }}>
 Erase all my data
 </button>
 <p style={{ fontSize: 11, color: C.dead, margin: "8px 0 14px", lineHeight: 1.55 }}>
 Empties your inventory, sales and watchlist. Your account stays open.
 </p>

 <button onClick={deleteAccount} disabled={closing} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "13px", borderColor: PW_TONE.weak.color,
 color: PW_TONE.weak.color, fontWeight: 700, cursor: closing ? "wait" : "pointer" }}>
 {closing ? "Deleting…" : "Delete my account"}
 </button>
 <p style={{ fontSize: 11, color: C.dead, margin: "8px 0 0", lineHeight: 1.55 }}>
 Closes your account and removes everything. There is no undo.
 </p>
 {closeErr && (
 <p role="alert" style={{ fontSize: 11.5, color: PW_TONE.weak.color, margin: "8px 0 0", lineHeight: 1.55 }}>
 {closeErr}
 </p>
 )}
 </Group>

 <Group title="Legal">
 {[["privacy", "Privacy Policy"], ["terms", "Terms of Service"]].map(([k, n]) => (
 <button key={k} onClick={() => setLegal(k)}
 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
 padding: "10px 0", background: "none", border: "none", cursor: "pointer", color: C.bone, textAlign: "left" }}>
 <span style={{ fontSize: 13.5 }}>{n}</span>
 <ChevronRight size={15} color={C.dim} />
 </button>
 ))}
 <p style={{ fontSize: 11, color: C.dead, margin: "10px 0 0", lineHeight: 1.55 }}>
 Questions about either: {SUPPORT_EMAIL}
 </p>
 </Group>

 {legal && <LegalSheet which={legal} onClose={() => setLegal(null)} />}
 </div>
 );
}

/* Both documents render through here. They are plain data — a list of
   [heading, ...paragraphs] — so the same content could be printed, emailed
   or served as a page without rewriting it as markup. */
function LegalSheet({ which, onClose }) {
  const doc = which === "terms" ? TERMS : PRIVACY;
  const title = which === "terms" ? "Terms of Service" : "Privacy Policy";
  return (
    <Sheet title={title} sub={`Last updated ${LEGAL_UPDATED}`} onClose={onClose}>
      {doc.map(([heading, ...paras], i) => (
        <div key={i} style={{ marginBottom: heading ? 18 : 14 }}>
          {heading && (
            <h3 style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
              {heading}
            </h3>
          )}
          {paras.map((t, j) => (
            <p key={j} style={{ fontSize: 13, lineHeight: 1.65, color: C.dim, margin: "0 0 8px" }}>
              {/* The unanswered bits are flagged in the copy itself rather
                  than hidden, so they cannot be published by accident. */}
              {t.startsWith("NEEDS YOUR ANSWER")
                ? <span style={{ color: C.accentText, fontWeight: 600 }}>{t}</span>
                : t}
            </p>
          ))}
        </div>
      ))}
    </Sheet>
  );
}

const Toggle = ({ label: l, on, onToggle }) => (
 <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", cursor: "pointer" }}>
 <span style={{ fontSize: 13.5 }}>{l}</span>
 <button role="switch" aria-checked={on} aria-label={l} onClick={onToggle}
 style={{ width: 44, height: 25, borderRadius: 999, border: "none", cursor: "pointer", background: on ? C.accent : C.raised, position: "relative", transition: "background .2s" }}>
 {/* The knob takes its colour from what it is sitting on. A white knob
     worked while every theme was dark; on a light one the off-state track
     is near-white too and the knob disappeared into it. */}
 <span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: 999, background: on ? C.onAccent : C.dead, transition: "left .2s cubic-bezier(.2,.7,.3,1), background .2s" }} />
 </button>
 </label>
);

const PAGE_STARTERS = {
 home: [["📊", "Review my business"], ["🎯", "What should I focus on today?"]],
 discover: [["🔥", "Find something to sell"], ["📍", "Find local opportunities"]],
 saturation: [["⚠️", "What's oversaturated near me?"], ["📈", "Where is competition falling?"]],
 business: [["📦", "What inventory is moving slowest?"], ["💰", "What made me the most money?"]],
 settings: [["❓", "How do themes work?"], ["🔐", "Is my data private?"]],
};

function FloatingAI({ db, biz, page, focus, user, isPro, requirePro }) {
 const [open, setOpen] = useState(false);

 // Everything the assistant knows about this user's business. Sent to the
 // Edge Function as `context`, where it is appended below the general-purpose
 // system prompt rather than replacing it — the assistant stays able to answer
 // anything, and additionally knows their numbers and the app's rules.
 const context = () => {
 const p = db.profile;
 const business = !db.settings.aiUseData
 ? `PAGE: ${page}${focus?.title ? ` \u2014 viewing "${focus.title}"` : ""}\n(Personalization is turned off in Settings.)`
 : `PAGE: ${page}${focus?.title ? ` \u2014 currently viewing "${focus.title}"` : ""}
USER: location ${p.zip || p.state || "not set"} (${p.radius}mi) | fee ${db.settings.feePct}% + ${db.settings.payPct}% pay + $${db.settings.ship} ship
INVENTORY (${db.inventory.length}): ${db.inventory.map((i) => `${i.title} x${i.unitsLeft} @ $${i.cost} (${Math.floor((Date.now()-new Date(i.addedAt))/864e5)}d old)`).join("; ") || "empty"}
SALES (${db.sales.length}): revenue $${biz.revenue.toFixed(0)}, profit $${biz.profit.toFixed(0)}, this range ${biz.itemsSold} sold
BEST MARKET: ${biz.bestMarket ? marketLabel(biz.bestMarket[0]) : "n/a"} | BEST PRODUCT: ${biz.bestProduct?.[0] || "n/a"}
WATCHLIST: ${db.watchlist.map((w) => w.title).join("; ") || "empty"}`;

 return `APPLICATION CONTEXT

You are embedded in this user's reselling app. Short, direct, warm \u2014 like a
sharp friend who resells, not a consultant. No headers, no bullet spam, under
130 words unless asked for more.

${business}

RULES FOR THIS APPLICATION:
- Use their real numbers above when personalization is on. Never give generic
  advice when their own data answers the question.
- Never display or assume a purchase/buy price for anything they have not
  entered themselves.
- Distinguish verified (things they logged) from estimated (market signals)
  from predicted (trend calls). Never guarantee income.
- Product search in this app covers eBay, Mercari, Vinted, Poshmark, Facebook
  Marketplace, Depop and OfferUp only.
- You can also just have a normal helpful conversation beyond reselling.`;
 };

 const starters = PAGE_STARTERS[page] || PAGE_STARTERS.home;

 /* A free account still gets the button — a feature nobody can see is a
    feature nobody buys — but tapping it raises the upgrade dialog instead
    of the chat. The Edge Function refuses free accounts as well, so this
    is the courteous half of the gate and not the whole of it. */

 return (
 <>
 <button onClick={() => { if (!requirePro("assistant")) return; setOpen(true); }}
 aria-label="Open AI assistant" className="fx fx-accent fab"
 style={{ position: "fixed", bottom: "calc(26px + env(safe-area-inset-bottom, 0px))", right: 18, width: 52, height: 52, borderRadius: 999, background: C.accent, border: "none", cursor: "pointer", zIndex: 45, boxShadow: "0 10px 28px -8px rgba(0,0,0,.5)", display: open ? "none" : "grid", placeItems: "center" }}>
 <Sparkles size={21} color={C.onAccent} />
 </button>

 {open && (
 <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 55, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
 <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="AI assistant" className="rise"
 style={{ background: C.panel, width: "100%", maxWidth: 560, height: "78vh", display: "flex", flexDirection: "column", borderTopLeftRadius: 26, borderTopRightRadius: 26, border: `1px solid ${C.line}`, borderBottom: "none" }}>
 <AIAssistant
 context={context()}
 starters={starters}
 token={user?.token || null}
 onClose={() => setOpen(false)}
 />
 </div>
 </div>
 )}
 </>
 );
}

function Sheet({ title, sub, onClose, children }) {
 return (
 <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.74)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
 <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} className="rise"
 style={{ background: C.panel, width: "100%", maxWidth: 560, padding: "22px 20px 34px", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTop: `1px solid ${C.line}`, maxHeight: "90vh", overflowY: "auto" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
 <div style={{ minWidth: 0 }}>
 <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.25 }}>{title}</div>
 {sub && <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.dead, marginTop: 6 }}>{sub}</div>}
 </div>
 <button onClick={onClose} aria-label="Close" className="fx"
 style={{ background: C.raised, border: "none", borderRadius: 999, width: 30, height: 30, cursor: "pointer", color: C.dim, flexShrink: 0, display: "grid", placeItems: "center" }}>
 <X size={15} />
 </button>
 </div>
 {children}
 </div>
 </div>
 );
}

function Field({ label: l, value, onChange, type = "text", prefix, placeholder, big }) {
 /* The label used to be a plain div sitting above the input, which looks
    right and is invisible to a screen reader — every field in Add product,
    Log a sale and Settings announced as an unlabelled box. A real
    <label htmlFor> ties the two together, and lets tapping the label focus
    the field. */
 const id = useId();
 return (
 <div style={{ marginBottom: 14, flex: 1 }}>
 <label htmlFor={id} style={{ ...label, marginBottom: 8, display: "block" }}>{l}</label>
 <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999, padding: "0 16px" }}>
 {prefix && <span style={{ fontFamily: MONO, fontSize: big ? 20 : 14, color: C.dim }}>{prefix}</span>}
 <input id={id} type={type} value={value} placeholder={placeholder} inputMode={type === "number" ? "decimal" : undefined}
 onChange={(e) => onChange(e.target.value)} className={big ? "fld fld-big" : "fld"}
 style={{ flex: 1, background: "none", border: "none", color: C.bone, outline: "none", fontFamily: type === "number" ? MONO : SANS, fontSize: big ? 20 : 14.5, fontWeight: big ? 600 : 400, padding: big ? "15px 0" : "13px 0", width: "100%" }} />
 </div>
 </div>
 );
}

const Num = ({ l, v, set, step = 1, prefix, suffix }) => (
 <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "7px 0" }}>
 <span style={{ fontSize: 13.5 }}>{l}</span>
 <span style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 14, color: C.dim }}>
 {prefix}
 <input type="number" value={v} step={step} min={0} inputMode="decimal" onChange={(e) => set(parseFloat(e.target.value) || 0)}
 style={{ width: 74, padding: "8px 12px", textAlign: "right", fontFamily: MONO, fontSize: 14, color: C.bone, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999 }} />
 {suffix}
 </span>
 </label>
);

const Primary = ({ label: l, onClick, disabled }) => (
 <button onClick={onClick} disabled={disabled} className={disabled ? "" : "fx fx-accent"}
 style={{ width: "100%", padding: "15px 16px", borderRadius: 999, border: "none", marginTop: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 14.5, fontWeight: 800, background: disabled ? C.raised : C.accent, color: disabled ? C.dead : C.onAccent }}>
 {l}
 </button>
);

const Group = ({ title, children }) => (
 <div className="rise" style={{ ...card, marginBottom: 10 }}>
 <div style={{ ...label, marginBottom: 12 }}>{title}</div>
 {children}
 </div>
);
const Row = ({ l, r }) => (
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
 <span style={{ fontSize: 13.5 }}>{l}</span><span style={{ fontSize: 13, color: C.dim }}>{r}</span>
 </div>
);
const Note = ({ children }) => (
 <p style={{ fontSize: 11.5, color: C.dead, margin: "14px 0 0", lineHeight: 1.6, paddingLeft: 12, borderLeft: `2px solid ${C.accentDim}` }}>{children}</p>
);

function Empty({ icon, title, body, cta, onCta }) {
 return (
 <div className="rise" style={{ ...card, borderRadius: 22, textAlign: "center", padding: "38px 22px" }}>
 <div style={{ fontSize: 34 }}>{icon}</div>
 <div style={{ fontSize: 17, fontWeight: 700, marginTop: 12 }}>{title}</div>
 <p style={{ fontSize: 13.5, color: C.dim, margin: "9px 0 0", lineHeight: 1.6 }}>{body}</p>
 {cta && (
 <button onClick={onCta} className="fx fx-accent"
 style={{ background: C.accent, color: C.onAccent, border: "none", borderRadius: 999, padding: "13px 26px", cursor: "pointer", fontSize: 13.5, fontWeight: 700, marginTop: 20 }}>{cta}</button>
 )}
 </div>
 );
}
