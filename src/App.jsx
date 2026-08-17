import React, { useState, useEffect, useMemo, useRef } from "react";
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

const AI_FN = `${SUPABASE_URL}/functions/v1/ai-assistant`;

/** The signed-in user's access token, for the JWT-gated Edge Functions. */
async function sessionToken() {
 try {
   const a = await window.storage.get("ros:session");
   return a ? JSON.parse(a.value).token || null : null;
 } catch { return null; }
}

/* Routed through the ai-assistant Edge Function, not api.anthropic.com.
   Calling Anthropic straight from the browser cannot work: the API sends no
   CORS headers to web origins, so the request is blocked before it leaves the
   page ("Failed to fetch" / "Load failed"), and the key would be exposed even
   if it did. The key lives server-side in the function. */
async function askClaude(messages, { context = "" } = {}) {
 const token = await sessionToken();
 const headers = { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY };
 if (token) headers.Authorization = `Bearer ${token}`;

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
function catalogMatches(query) {
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
  }));
}

const SearchProvider = {
 async searchProducts(query, marketplaces = ONLINE, mode = "online") {
   // Preferred path: Tavily via the Edge Function. Real listing pages,
   // domain-restricted at the source, key never exposed.
   if (USE_TAVILY) {
     try {
       const res = await fetch(SEARCH_FN, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "apikey": SUPABASE_PUBLISHABLE_KEY,
           "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
         },
         body: JSON.stringify({ query, mode, maxResults: 10 }),
       });
       if (res.ok) {
         const data = await res.json();
         if (Array.isArray(data.results) && data.results.length) {
           return data.results.map((r) => ({
             title: stripPrices(r.title), market: r.market,
             cond: "", url: safeUrl(r.url), image: r.image || null,
             snippet: r.snippet || "", source: "tavily",
           })).filter((r) => r.url);
         }
       }
       // non-OK or empty falls through to the fallback below
     } catch { /* network/CORS — fall through */ }
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

   // Always something to show.
   return catalogMatches(query);
 },

 async searchLocalProducts(query, loc = {}) {
   return SearchProvider.searchProducts(
     `${query} ${loc.zip || loc.state || ""}`.trim(), LOCAL, "local");
 },

 // Current market info for the chatbot. Returns SOURCES so the assistant
 // cites instead of asserts, plus how old the freshest source is.
 async researchMarket(question, depth = "basic") {
   if (USE_TAVILY) {
     try {
       const res = await fetch(RESEARCH_FN, {
         method: "POST",
         headers: {
           "Content-Type": "application/json",
           "apikey": SUPABASE_PUBLISHABLE_KEY,
           "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
         },
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

 async getRecentSoldData(title, windowDays = 90) {
 const ref = CATALOG.find((c) => c.title === title);
 if (!ref) return { count: null, windowDays, estimated: true, unavailable: true };
 const scale = windowDays >= 90 ? 1 : windowDays >= 30 ? 0.4 : 0.12;
 return { count: Math.max(1, Math.round(ref.comps90 * scale)), windowDays, estimated: true };
 },

 async findSimilarProducts(item, pool = CATALOG) {
 return pool.filter((p) => p.cat === item.cat && p.title !== item.title)
 .sort((a, b) => (b.vel / (b.sellers || 1)) - (a.vel / (a.sellers || 1)))
 .slice(0, 3);
 },

 async getMarketSignals(f) {
 const local = f.mode === "local";
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
 .map((c, i) => ({ ...c, rank: i + 1, why: c.why || "", origin: "catalog" }));
 if (!rows.length) throw new Error(`No ${f.cat} products in the built-in catalog. Try All, or a different category.`);
 return rows;
 },
};

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

const CATALOG = [
 { title: "Dior Sauvage EDT 100ml", cat: "Colognes", source: "ebay", comp: 142, vel: 5.8, sellers: 34, comps90: 23, trend: "up" },
 { title: "Jordan 1 Low Panda US 9", cat: "Shoes", source: "mercari", comp: 112, vel: 8.1, sellers: 71, comps90: 44, trend: "up" },
 { title: "Carhartt Detroit Jacket L", cat: "Clothes", source: "depop", comp: 148, vel: 4.2, sellers: 31, comps90: 21, trend: "up" },
 { title: "Casio G-Shock GA-2100", cat: "Accessories", source: "mercari", comp: 104, vel: 6.4, sellers: 55, comps90: 29, trend: "up" },
 { title: "Gold plated Cuban chain 18in", cat: "Jewelry", source: "mercari", comp: 74, vel: 3.7, sellers: 88, comps90: 17, trend: "down" },
 { title: "Supreme Camp Cap", cat: "Headwear", source: "depop", comp: 68, vel: 2.4, sellers: 26, comps90: 9, trend: "flat" },
];

const VOCAB = [...new Set([...CATALOG.map((c) => c.title),
 "Dior Sauvage", "Creed Aventus", "Jordan 1", "Jordan 4", "Nike Dunk Low",
 "Supreme Box Logo", "Carhartt Detroit Jacket", "Casio G-Shock", "PS5", "Dyson Airwrap",
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

const THEMES = {
 wealth: { name: "Wealth", sub: "Black + Emerald", void:"#0A0F0C", panel:"#121A15", raised:"#1B2620", line:"#243328", accent:"#10B981", accentDim:"#065F46", bone:"#F2F7F4", dim:"#9BB0A3", dead:"#66786C" },
 heat: { name: "Heat", sub: "Black + Red", void:"#0B0708", panel:"#17100F", raised:"#221818", line:"#2E2020", accent:"#E5142B", accentDim:"#7E0A17", bone:"#F5EFEE", dim:"#A08F8F", dead:"#6E6060" },
 ice: { name: "Ice", sub: "White + Blue", void:"#F4F8FC", panel:"#FFFFFF", raised:"#EAF1F9", line:"#D8E4F0", accent:"#1264E0", accentDim:"#0C3D8C", bone:"#101B2B", dim:"#5C6C80", dead:"#95A3B3" },
 night: { name: "Night", sub: "Black + Purple", void:"#0A0810", panel:"#150F1E", raised:"#201530", line:"#2B2040", accent:"#9B5CF6", accentDim:"#5B2FA6", bone:"#F3EFFA", dim:"#A79BC0", dead:"#6E6483" },
 clean: { name: "Clean", sub: "White + Orange", void:"#FBF7F2", panel:"#FFFFFF", raised:"#F4EBDF", line:"#E8DAC5", accent:"#E8720C", accentDim:"#B8560A", bone:"#241A0F", dim:"#8A7A63", dead:"#B3A38C" },
};

const C = {
 void:"var(--c-void)", panel:"var(--c-panel)", raised:"var(--c-raised)", line:"var(--c-line)",
 accent:"var(--c-accent)", accentDim:"var(--c-accentDim)", bone:"var(--c-bone)", dim:"var(--c-dim)", dead:"var(--c-dead)",
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "'Archivo', ui-sans-serif, system-ui, sans-serif";

const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 };
const pillBtn = (on) => ({ borderRadius: 999, padding: "9px 16px", cursor: "pointer", fontSize: 13,
 fontWeight: on ? 700 : 600, background: on ? C.accent : "transparent",
 color: on ? "#fff" : C.dim, border: `1px solid ${on ? C.accent : C.line}` });
const inputSt = { padding: "12px 16px", fontFamily: SANS, fontSize: 14.5, color: C.bone,
 background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999, width: "100%" };
const label = { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim };
const rise = (i = 0) => ({ animationDelay: `${i * 55}ms` });
const MOTIVATION = ["Let's make some money.", "Let's build this wealth.", "Time to grow the business.", "Let's find the next winner."];

const DEFAULTS = {
 profile: { name: "", state: "", zip: "", radius: 25, onboarded: false, theme: "heat" },
 settings: { feePct: 13.25, payPct: 2.9, ship: 8, startingBalance: 0,
 notif: { opps: true, satur: true, demand: true, local: true }, aiUseData: true },
 inventory: [], sales: [], watchlist: [], goals: [], notifications: [], readNotifs: [],
};

function useStore() {
 const [db, setDb] = useState(DEFAULTS);
 const [ready, setReady] = useState(false);

 useEffect(() => {
 (async () => {
 const next = { ...DEFAULTS };
 for (const k of Object.keys(DEFAULTS)) {
 try { const r = await window.storage.get(`ros:${k}`); if (r) next[k] = JSON.parse(r.value); } catch {}
 }
 if (!next.notifications.length) next.notifications = seedNotifications(next.profile);
 setDb(next); setReady(true);
 })();
 }, []);

 const put = async (key, value) => {
 setDb((d) => ({ ...d, [key]: value }));
 try { await window.storage.set(`ros:${key}`, JSON.stringify(value)); } catch {}
 };
 const reset = async () => {
 for (const k of Object.keys(DEFAULTS)) { try { await window.storage.delete(`ros:${k}`); } catch {} }
 setDb(DEFAULTS);
 };
 return { db, ready, put, reset };
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
 const t = THEMES[theme] || THEMES.heat;
 return (
 <style>{`
 @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
 .reseller-root {
 --c-void:${t.void}; --c-panel:${t.panel}; --c-raised:${t.raised}; --c-line:${t.line};
 --c-accent:${t.accent}; --c-accentDim:${t.accentDim}; --c-bone:${t.bone}; --c-dim:${t.dim}; --c-dead:${t.dead};

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
 .topnav { display: none; }
 .topnav-link {
   background: none; border: none; padding: 0 1px 8px; cursor: pointer;
   font-family: inherit; font-size: 13.5px; font-weight: 600;
   letter-spacing: -0.01em; white-space: nowrap;
   /* Grey at rest — the row shouldn't compete with the page. */
   color: var(--c-dead);
   border-bottom: 2px solid transparent;
   transition: color .16s, border-color .16s;
 }
 /* Hovering and being on the tab read the same: the word takes the
    theme's accent. The underline is what separates "could go here"
    from "am here". */
 .topnav-link:hover { color: var(--c-accent); }
 .topnav-link[aria-current="page"] { color: var(--c-accent); border-bottom-color: var(--c-accent); }
 @media (min-width: 900px) { .topnav { display: flex; } }

 /* For a host showing the app at phone size inside a wider window — a
    preview frame, an embed. Media queries read the window, not the box,
    so without this the row would appear inside a 412px-wide phone.
    Nothing sets this in normal use. */
 [data-layout="mobile"] .topnav { display: none !important; }

 /* Collapsible stock heading. The row is full width, so fx-chip's glow
    would ring the whole line — a plain colour shift is the right weight
    here. !important because the label style is inline and would win. */
 .stock-head:hover { color: var(--c-bone) !important; }
 .stock-head:hover svg { color: var(--c-accent); }
 button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible, textarea:focus-visible {
 outline: 2px solid ${C.accent}; outline-offset: 3px; }
 ::-webkit-scrollbar { width:0; height:0; }
 /* Keep the hover glow, drop the hover movement — without this the lift
    still happens, just instantly, which is worse for motion sensitivity
    than a smooth one. */
 @media (prefers-reduced-motion: reduce) {
   *{animation:none !important; transition:none !important} .rise{opacity:1 !important}
   .fx:hover, .fx:active { transform: none !important; }
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

async function supabaseAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || `Sign-in failed (${res.status}).`);
  }
  return data;
}

const AUTH_ICONS = [Footprints, Watch, Gem, Shirt, ShoppingBag, Droplets, Package, TrendingUp, Bookmark, Sparkles];

/* Brand mark. A price tag with a rising arrow inside — the item, and what
   it gains. The tag's hole is the same accent dot as the period in
   "RESELLING.", so the mark and the wordmark share one idea.

   The outline takes `currentColor`, so it inherits whatever it sits on,
   and the dot and arrow take the accent. That keeps it correct in all
   five themes without the component knowing any colour. */
function Logo({ size = 46, accent = C.accent, title = "Reselling" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
      role="img" aria-label={title} style={{ display: "block" }}>
      <path d="M22 8 H34 A6 6 0 0 1 40 14 V34 A6 6 0 0 1 34 40 H16 A6 6 0 0 1 10 34 V20 Z"
        stroke="currentColor" strokeWidth="3.1" strokeLinejoin="round" />
      <circle cx="20.5" cy="18.5" r="2.6" fill={accent} />
      <path d="M19 33 L32 20 M27 20 H32 V25"
        stroke={accent} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Password rules. Every one must pass before an account can be created —
   the strength bar is the visible half of exactly this list, so the meter
   and the gate can never disagree with each other. */
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

function AuthScreen({ onDone, theme }) {
  const [mode, setMode]   = useState("login");   // login | signup
  const [phase, setPhase] = useState("form");    // form | verify
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [loginWith, setLoginWith] = useState("email"); // email | username
  const [loginId, setLoginId] = useState("");          // whichever of the two they typed
  const [pw, setPw]       = useState("");
  const [code, setCode]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);
  const [note, setNote]   = useState(null);

  const t = THEMES[theme] || THEMES.heat;
  const strength = passwordStrength(pw);
  const emailOk = /\S+@\S+\.\S+/.test(email);
  // Logging in only needs credentials that already exist; the rules gate
  // account creation, so an older weaker password can still sign in.
  const loginIdOk = loginWith === "email"
    ? /\S+@\S+\.\S+/.test(loginId)
    : loginId.trim().length >= 2;
  const ok = mode === "login"
    ? loginIdOk && pw.length >= 6
    : emailOk && username.trim().length >= 2 && strength.ok;

  const submit = async () => {
    // Spell out why rather than leaving a dead button. The strength gate is
    // the most likely reason someone is stuck here.
    if (!busy && mode === "signup" && emailOk && username.trim().length >= 2 && !strength.ok) {
      const missing = strength.met.filter((r) => !r.ok).map((r) => r.label.toLowerCase());
      setErr(`Password is too weak${strength.level === "fair" ? " — only fair" : ""}. Still needs ${missing.join(", ")}. Try again.`);
      return;
    }
    if (!ok || busy) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      if (mode === "signup") {
        const d = await supabaseAuth("signup", {
          email,
          password: pw,
          // The signup trigger reads full_name/name out of this metadata to
          // fill in profiles.name, so the username lands in the profile row.
          data: { username: username.trim(), name: username.trim() },
        });
        if (d.user && !d.access_token) {
          // No note here — the verify screen's own heading already says this,
          // and setting both printed the same sentence twice.
          setPhase("verify"); setCode("");
          setBusy(false); return;
        }
        onDone({ email, provider: "email", token: d.access_token, id: d.user?.id, username: username.trim() });
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
        onDone({ email: d.user?.email || loginId.trim(), provider: "email", token: d.access_token, id: d.user?.id });
      } else {
        const d = await supabaseAuth("token?grant_type=password", { email: loginId.trim(), password: pw });
        onDone({ email: loginId.trim(), provider: "email", token: d.access_token, id: d.user?.id });
      }
    } catch (e) {
      // Sandbox blocked the call, or the project isn't reachable from here.
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        setNote("Can't reach Supabase from this preview. Continuing in demo mode.");
        // The login tab writes to loginId and the sign-up tab to email. Sending
        // the wrong one here handed the app an identity with no address at all.
        const who = mode === "login" ? loginId.trim() : email.trim();
        setTimeout(() => onDone({ email: who, provider: "demo", username: username.trim() }), 900);
      } else setErr(e.message);
    } finally { setBusy(false); }
  };

  /* Exchanges the emailed 6-digit code for a session. Supabase calls this
     token verification: type "signup" confirms the address and signs the
     new account in, in one step. */
  const verifyCode = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length !== 6 || busy) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const d = await supabaseAuth("verify", { type: "signup", email, token });
      if (!d.access_token) { setErr("That code didn't work. Check it and try again."); return; }
      onDone({ email, provider: "email", token: d.access_token, id: d.user?.id, username: username.trim() });
    } catch (e) {
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        setNote("Can't reach Supabase from this preview. Continuing in demo mode.");
        setTimeout(() => onDone({ email, provider: "demo", username: username.trim() }), 900);
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
        onDone({ email: u.email, provider: "google", token: d.access_token, id: u.id });
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
          border-color: var(--c-accent);
          box-shadow: var(--glow);
        }
        /* Declared after :hover so a focused field keeps the stronger ring
           even while the pointer is over it. */
        .auth-in:focus-within {
          border-color: var(--c-accent) !important;
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
          color: var(--c-accent) !important; transform: translateY(-1px);
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
          border-color: var(--c-accent) !important; transform: translateY(-1px);
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
            <div className="auth-logo" style={{ display: "flex", justifyContent: "center", marginBottom: 15, color: t.bone }}>
              <Logo size={46} accent={t.accent} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.045em" }}>
              RESELLING<span style={{ color: t.accent }}>.</span>
            </div>
            <div style={{ fontSize: 12.5, color: t.dim, marginTop: 8, letterSpacing: "0.02em" }}>
              {mode === "login" ? "Welcome back" : "Start tracking what actually sells"}
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
                  <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                    placeholder="000000" aria-label="6-digit verification code" className="otp-in"
                    style={{ width: "100%", background: "none", border: "none", outline: "none",
                      color: t.bone, fontFamily: MONO, fontSize: 26, fontWeight: 700,
                      letterSpacing: "0.34em", textAlign: "center", padding: "16px 0" }} />
                </div>

                {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accent, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
                {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

                <button onClick={verifyCode} disabled={code.length !== 6 || busy} className="auth-cta"
                  style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                    cursor: code.length === 6 && !busy ? "pointer" : "not-allowed",
                    fontFamily: SANS, fontSize: 15, fontWeight: 800,
                    background: code.length === 6 ? t.accent : t.raised,
                    color: code.length === 6 ? "#fff" : t.dead }}>
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
                    fontWeight: 700, color: mode === k ? "#fff" : t.dim }}>
                  {l}
                </button>
              ))}
            </div>

            {mode === "signup" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>Username</div>
                <div className="auth-in" style={{ display: "flex", alignItems: "center", background: t.raised, border: `1px solid ${t.line}`, borderRadius: 14, padding: "0 16px" }}>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="What should we call you?" autoComplete="username" maxLength={40}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    style={{ flex: 1, background: "none", border: "none", outline: "none", color: t.bone, fontFamily: SANS, fontSize: 15, padding: "14px 0" }} />
                </div>
              </div>
            )}

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
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.dim, marginBottom: 8 }}>Password</div>
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
              </div>
            )}

            {mode === "login" && (
              <div style={{ height: 16, fontSize: 11, color: pw && pw.length < 6 ? t.accent : "transparent", marginBottom: 6 }}>
                Password needs at least 6 characters
              </div>
            )}

            {err  && <div role="alert" style={{ fontSize: 12.5, color: t.accent, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
            {note && <div style={{ fontSize: 12.5, color: t.dim, marginBottom: 12, lineHeight: 1.5 }}>{note}</div>}

            <button onClick={submit} disabled={busy} className="auth-cta"
              style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none",
                cursor: busy ? "not-allowed" : "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 800,
                background: ok ? t.accent : t.raised, color: ok ? "#fff" : t.dead }}>
              {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
            </button>

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
          </div>

          <p style={{ fontSize: 11, color: t.dead, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
            Email sign-up writes to your real Supabase project.<br />
            Google needs your deployed domain to redirect back.
          </p>
        </div>
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
 <Styles theme="heat" />
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
 <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 600 }}>{radius} mi</span>
 </div>
 <input type="range" min={5} max={100} step={5} value={radius} aria-label="Radius"
 onChange={(e) => setRadius(+e.target.value)} style={{ width: "100%", accentColor: C.accent }} />
 </div>
 </div>
 <button disabled={!ok} onClick={() => onDone({ state, zip, radius })} className={ok ? "fx fx-accent" : ""}
 style={{ marginTop: 30, padding: "16px", borderRadius: 999, border: "none", fontSize: 14.5, fontWeight: 800, cursor: ok ? "pointer" : "not-allowed", background: ok ? C.accent : C.raised, color: ok ? "#fff" : C.dead }}>
 Show me opportunities
 </button>
 </div>
 </div>
 );
}

export default function ResellOS() {
 const { db, ready, put, reset } = useStore();
 const [stage, setStage] = useState("auth"); // auth | app
 const [tab, setTab] = useState("home");
 const [jump, setJump] = useState(null);
 const [user, setUser] = useState(null);
 const [aiOpen, setAiOpen] = useState(false);
 const [range, setRange] = useState("30");
 const biz = useBusiness(db, range);

 useEffect(() => {
 (async () => {
   // Coming back from Google? The implicit flow puts tokens in the hash.
   try {
     const h = window.location.hash || "";
     if (h.includes("access_token=")) {
       const token = new URLSearchParams(h.slice(1)).get("access_token");
       if (token) {
         const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
           headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
         });
         if (res.ok) {
           const u = await res.json();
           const profile = { email: u.email, provider: "google", token, id: u.id };
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

 const go = (t, payload = null) => { setJump(payload); setTab(t); };

 // Clears the session and returns to the login screen, so the whole flow
 // can be walked again from the top.
 //
 // All three updates run before the await, so React batches them into one
 // render that shows the login screen. Awaiting first would flush
 // setUser(null) on its own and re-render the app header — which reads
 // user.email — against a null user, blanking the screen.
 const signOut = async () => {
   setStage("auth");
   setUser(null);
   setTab("home");
   try { await window.storage.delete("ros:session"); } catch {}
 };
 const theme = db.profile.theme || "heat";
 /* Whatever we can call this person. Indexing straight into user.email
    crashed the whole app to a blank screen when a sign-in produced a session
    with no address on it — a label is never worth taking the UI down for. */
 const who = (user?.username || user?.email || "").trim() || "Signed in";

 if (!ready) return <div style={{ minHeight: "100vh", background: THEMES.heat.void }} />;

 // `|| !user` is a backstop: everything below this line reads user.email, so
 // a null user must never reach it, however the state got that way.
 if (stage === "auth" || !user) return (
 <AuthScreen theme={theme} onDone={async (p) => {
 setUser(p); try { await window.storage.set("ros:session", JSON.stringify(p)); } catch {}
 setStage("app");
 }} />
 );

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
 <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(104px + env(safe-area-inset-bottom, 0px))" }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, paddingBottom: 14 }}>
 <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.03em" }}>
 RESELLING<span style={{ color: C.accent }}>.</span>
 </span>
 <button onClick={signOut} className="fx fx-chip" title={`Signed in as ${who} — tap to sign out`}
 style={{ display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 13px 5px 5px", cursor: "pointer", fontFamily: SANS, fontSize: 12, color: C.dim }}>
 <span style={{ width: 22, height: 22, borderRadius: 999, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>
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
 {tab === "home" && <HomeScreen db={db} put={put} biz={biz} range={range} setRange={setRange} go={go} />}
 {tab === "discover" && <Discover db={db} put={put} jump={jump} go={go} />}
 {tab === "saturation" && <Saturation db={db} go={go} />}
 {tab === "business" && <Business db={db} biz={biz} put={put} range={range} setRange={setRange} jump={jump} />}
 {tab === "settings" && <SettingsPage db={db} put={put} reset={reset} user={user} signOut={signOut} />}
 </div>
 </div>

 {/* Tab bar, flush to the bottom edge on every tab. It was a rounded pill
     floating 14px up, which left a strip of the page scrolling past
     underneath it. Now it spans the full width, sits on the edge, and is
     opaque enough that content passes behind rather than through it.
     The safe-area inset keeps it clear of the iPhone home indicator. */}
 <nav style={{
   position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
   background: "color-mix(in srgb, var(--c-void) 94%, transparent)",
   backdropFilter: "blur(16px)",
   WebkitBackdropFilter: "blur(16px)",
   borderTop: `1px solid ${C.line}`,
   paddingBottom: "env(safe-area-inset-bottom, 0px)",
 }}>
 <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", padding: "9px 6px 11px" }}>
 {TABS.map(([k, name, Icon]) => {
 const on = tab === k;
 return (
 <button key={k} onClick={() => go(k)} aria-label={name} aria-current={on ? "page" : undefined}
 style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "5px 0", display: "grid", justifyItems: "center", gap: 4 }}>
 <Icon size={20} strokeWidth={on ? 2.5 : 1.9} color={on ? C.accent : C.dead} />
 <span style={{ fontSize: 9.5, fontWeight: on ? 700 : 500, color: on ? C.bone : C.dead }}>{name}</span>
 </button>
 );
 })}
 </div>
 </nav>

 <FloatingAI db={db} biz={biz} page={tab} focus={jump} user={user} />
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
  const wrapRef = useRef(null);
  const { points, tickEvery } = useMemo(() => chartSeries(sales, range), [sales, range]);

  // 320x140 renders about 364x159 in the card — roughly a 2.3:1 plot, wide
  // enough to read a trend without the card swallowing the screen.
  const W = 320, H = 140;
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

function HomeScreen({ db, put, biz, range, setRange, go }) {
 const [notifOpen, setNotifOpen] = useState(false);
 const [goalText, setGoalText] = useState("");
 const hour = new Date().getHours();
 const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
 const msg = MOTIVATION[new Date().getDate() % MOTIVATION.length];
 const unread = db.notifications.filter((n) => !db.readNotifs.includes(n.id)).length;

 const addGoal = async () => {
 if (!goalText.trim()) return;
 await put("goals", [{ id: `g${Date.now()}`, text: goalText.trim(), done: false }, ...db.goals]);
 setGoalText("");
 };
 const toggleGoal = async (id) =>
 put("goals", db.goals.map((g) => g.id === id ? { ...g, done: !g.done } : g));
 const removeGoal = async (id) => put("goals", db.goals.filter((g) => g.id !== id));

 const empty = db.inventory.length === 0 && db.sales.length === 0;

 return (
 <div style={{ paddingTop: 4 }}>
 <div className="rise" style={{ ...rise(0), display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
 <div>
 <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.2 }}>
 {greet}, {db.profile.name || "there"} 👋
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

 <div className="rise" style={{ ...rise(2), display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
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
 style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>
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

 <div className="rise" style={{ ...rise(5), ...card, marginTop: 10 }}>
 <div style={{ ...label, marginBottom: 12 }}>My goals</div>
 {db.goals.length === 0 && <p style={{ fontSize: 13, color: C.dead, margin: 0 }}>No goals yet.</p>}
 {db.goals.map((g) => (
 <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
 <button onClick={() => toggleGoal(g.id)} aria-label={g.done ? "Mark incomplete" : "Mark complete"}
 style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer", background: g.done ? C.accent : "transparent", border: `1.5px solid ${g.done ? C.accent : C.line}`, display: "grid", placeItems: "center" }}>
 {g.done && <Check size={13} color="#fff" />}
 </button>
 <span style={{ flex: 1, fontSize: 13.5, textDecoration: g.done ? "line-through" : "none", color: g.done ? C.dead : C.bone }}>{g.text}</span>
 <button onClick={() => removeGoal(g.id)} aria-label="Remove goal"
 style={{ background: "none", border: "none", cursor: "pointer", color: C.dead, padding: 4 }}>
 <X size={14} />
 </button>
 </div>
 ))}
 <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
 <input value={goalText} onChange={(e) => setGoalText(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && addGoal()} placeholder="List 5 products…"
 style={{ ...inputSt, flex: 1, padding: "10px 15px", fontSize: 13.5 }} />
 <button onClick={addGoal} aria-label="Add goal" className="fx fx-chip"
 style={{ width: 40, borderRadius: 999, border: `1px solid ${C.line}`, background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}>
 <Plus size={16} color={C.accent} />
 </button>
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

function Discover({ db, put, jump, go }) {
 const [sub, setSub] = useState(jump?.sub || "ai");
 const [detail, setDetail] = useState(jump?.item || null);
 useEffect(() => { if (jump?.sub) setSub(jump.sub); if (jump?.item) setDetail(jump.item); }, [jump]);

 return (
 <div style={{ paddingTop: 4 }}>
 <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
 {[["ai", "AI Discover", Sparkles], ["search", "Product Search", SearchIcon], ["saved", "Saved", Bookmark]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => setSub(k)} className="fx fx-chip"
 style={{ ...pillBtn(sub === k), display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }}>
 <Icon size={14} /> {n}
 </button>
 ))}
 </div>
 {sub === "ai" && <AIDiscover db={db} put={put} onDetail={setDetail} />}
 {sub === "search" && <ProductSearch db={db} onAnalyze={(r) => {
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
 if (f.ticket !== "all") list = list.filter((r) => TICKET(r.comp) === f.ticket);
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
 <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 600 }}>{f.radius} mi</span>
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
 style={{ width: "100%", padding: "17px 16px", border: "none", borderRadius: 999, cursor: busy ? "wait" : "pointer", fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: busy ? C.raised : C.accent, color: busy ? C.dead : "#fff" }}>
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
 {err && !busy && <div style={{ ...card, borderColor: C.accent, marginTop: 12 }}><p style={{ fontSize: 13.5, color: C.accent, margin: 0, fontWeight: 700 }}>{err}</p></div>}
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
 const a = VOCAB.filter((v) => v.toLowerCase().startsWith(n));
 const b = VOCAB.filter((v) => !v.toLowerCase().startsWith(n) && v.toLowerCase().includes(n));
 setSugs([...a, ...b].slice(0, 5));
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
 scope === "local" ? SearchProvider.searchLocalProducts(t, db.profile) : SearchProvider.searchProducts(t, marketplaces),
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
 style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 999, padding: "0 24px", cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>{busy ? "…" : "Go"}</button>
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
 {err && !busy && <p style={{ fontSize: 13.5, color: C.accent, marginTop: 16, fontWeight: 600 }}>{err}</p>}
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

 const items = picked.map((t) => CATALOG.find((c) => c.title === t)).filter(Boolean);

 if (!list.length) return <Empty icon="🔖" title="Nothing saved yet"
 body="Save products from See More and they'll show up here to compare side by side." />;

 return (
 <div>
 {list.map((w, i) => {
 const on = picked.includes(w.title);
 const ref = CATALOG.find((c) => c.title === w.title);
 return (
 <div key={w.title} className="rise" style={{ ...rise(i), ...card, borderRadius: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
 <button onClick={() => toggle(w.title)} aria-label={on ? "Deselect" : "Select"}
 style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: "pointer", background: on ? C.accent : "transparent", border: `1.5px solid ${on ? C.accent : C.line}`, display: "grid", placeItems: "center" }}>
 {on && <Check size={14} color="#fff" />}
 </button>
 <button onClick={() => ref && onDetail(ref)} style={{ flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: ref ? "pointer" : "default", color: C.bone }}>
 <div style={{ fontSize: 14, fontWeight: 700 }}>{w.title}</div>
 <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>{w.cat}</div>
 </button>
 <button onClick={() => remove(w.title)} aria-label="Remove" className="fx"
 style={{ background: "none", border: "none", cursor: "pointer", color: C.dead, padding: 4, flexShrink: 0 }}>
 <X size={15} />
 </button>
 </div>
 );
 })}

 <button onClick={() => setCompare(true)} disabled={picked.length < 2} className={picked.length >= 2 ? "fx fx-accent" : ""}
 style={{ width: "100%", marginTop: 10, padding: "14px", borderRadius: 999, border: "none", cursor: picked.length >= 2 ? "pointer" : "not-allowed", fontSize: 13.5, fontWeight: 700, background: picked.length >= 2 ? C.accent : C.raised, color: picked.length >= 2 ? "#fff" : C.dead }}>
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
 <Mini l="Trend" v={it.trend === "up" ? "Rising" : it.trend === "down" ? "Falling" : "Flat"} />
 </div>
 <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: VERDICT_COLOR[v.tone], marginTop: 10 }}>
 {v.label}
 </div>
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
 <TrendIcon trend={item.trend} />
 <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
 {item.cat} · {kind} · Demand {demandLabel(item.vel)}
 </span>
 </div>
 {item.why && <div style={{ fontSize: 12, color: C.dead, marginTop: 5 }}>{item.why}</div>}
 </div>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
 <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: VERDICT_COLOR[v.tone] }}>{v.label}</span>
 <button onClick={() => onDetail(item)} className="fx fx-chip"
 style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: `1px solid ${C.accentDim}`, borderRadius: 999, padding: "7px 14px", color: C.bone, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
 See More <ChevronRight size={13} />
 </button>
 </div>
 </div>
 );
}

function ProductDetailSheet({ item, db, put, onClose }) {
 const [window_, setWindowD] = useState(90);
 const [sold, setSold] = useState(null);
 const [related, setRelated] = useState([]);
 const [saved, setSaved] = useState(false);
 const [showCost, setShowCost] = useState(false);
 const [cost, setCost] = useState("");
 const s = db.settings;

 useEffect(() => {
 setSaved((db.watchlist || []).some((w) => w.title === item.title));
 SearchProvider.getRecentSoldData(item.title, window_).then(setSold);
 SearchProvider.findSimilarProducts(item).then(setRelated);
 }, [item.title, window_]); // eslint-disable-line

 const save = async () => {
 const list = db.watchlist || [];
 await put("watchlist", saved ? list.filter((w) => w.title !== item.title) : [...list, { title: item.title, cat: item.cat }]);
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
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 6 }}>
 <Mini l="Demand" v={demandLabel(item.vel)} />
 <Mini l="Competition" v={compLabel(item.sellers)} />
 <Mini l="Saturation" v={satLabel(item.vel, item.sellers)} />
 <Mini l="Trend" v={item.trend === "up" ? "Rising" : item.trend === "down" ? "Falling" : "Flat"} />
 </div>

 <div style={{ ...card, marginTop: 10 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
 <span style={label}>Recent sold activity</span>
 <div style={{ display: "flex", gap: 5 }}>
 {[7, 30, 90].map((d) => (
 <button key={d} onClick={() => setWindowD(d)} className="fx fx-chip"
 style={{ ...pillBtn(window_ === d), padding: "4px 9px", fontSize: 10.5 }}>{d}d</button>
 ))}
 </div>
 </div>
 {!sold ? (
 <div style={{ fontFamily: MONO, fontSize: 13, color: C.dead }}>Checking…</div>
 ) : sold.unavailable ? (
 <div style={{ fontFamily: MONO, fontSize: 14, color: C.dim }}>No reliable sold data</div>
 ) : (
 <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600 }}>
 {sold.count} <span style={{ fontSize: 12, color: C.dim, fontWeight: 400 }}>sold, last {window_} days</span>
 </div>
 )}
 <p style={{ fontSize: 11, color: C.dead, margin: "8px 0 0" }}>
 {sold?.unavailable
 ? "This product isn't in our reference data. Use the marketplace links below to check sold listings directly."
 : sold?.estimated ? "Estimated from available signals — connect a marketplace for verified counts." : ""}
 </p>
 <div style={{ marginTop: 12, fontSize: 13, color: C.dim }}>
 Recent sold price: <span style={{ color: C.bone, fontWeight: 700, fontFamily: MONO }}>
 {item.comp > 0 ? money0(item.comp) : "Not available"}</span>
 </div>
 </div>

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
 {m.label}{m.sold && <span style={{ fontFamily: MONO, fontSize: 9, color: C.accent }}>SOLD</span>}
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

function Saturation({ db, go }) {
 const [mode, setMode] = useState("online");
 const [cat, setCat] = useState("All");
 const [ticket, setTicket] = useState("all");
 const [alt, setAlt] = useState(null);
 const [altList, setAltList] = useState([]);
 const [detail, setDetail] = useState(null);

 const pool = CATALOG.filter((c) => (cat === "All" || c.cat === cat) && (ticket === "all" || TICKET(c.comp) === ticket));
 const crowded = [...pool].sort((a, b) => b.sellers - a.sellers).slice(0, 4);
 const rising = crowded.filter((c) => c.trend !== "down").slice(0, 2);
 const falling = [...pool].filter((c) => c.trend === "down").slice(0, 2);
 const open = [...pool].sort((a, b) => a.sellers - b.sellers).slice(0, 3);

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
 {mode === "local" && (
 <p style={{ fontSize: 12.5, color: C.dim, margin: "0 4px 12px", lineHeight: 1.5 }}>
 Based on {db.profile.zip || db.profile.state || "your area"}, {db.profile.radius} mile radius.
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

 {detail && <ProductDetailSheet item={detail} db={db} put={() => {}} onClose={() => setDetail(null)} />}
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

function Business({ db, biz, put, range, setRange, jump }) {
 const [sub, setSub] = useState(jump?.sub || "inventory");
 useEffect(() => { if (jump?.sub) setSub(jump.sub); }, [jump]);
 return (
 <div style={{ paddingTop: 4 }}>
 <div style={{ display: "flex", gap: 7, marginBottom: 18, overflowX: "auto" }}>
 {[["inventory", "Inventory", Package], ["sales", "Sales", TrendingUp],
 ["calc", "Calculator", CalcIcon], ["listing", "Listing", FileText],
 ["essentials", "Essentials", Wrench]].map(([k, n, Icon]) => (
 <button key={k} onClick={() => setSub(k)} className="fx fx-chip"
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
 style={{ width: "100%", padding: "14px", border: "none", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700, background: C.accent, color: "#fff", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
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
 const ok = f.title.trim() && +f.cost > 0 && +f.units > 0;
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
 purchaseDate: new Date(f.purchaseDate).toISOString(), notes: f.notes.trim() })} />
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
 const ok = method && amt > 0 && +f.qty > 0 && +f.qty <= item.unitsLeft;

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
 market: isMeetup ? "meetup" : f.market, method, soldAt: new Date(f.soldAt).toISOString(),
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
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
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
 {err && <p style={{ fontSize: 12.5, color: C.accent, marginTop: 12, fontWeight: 600 }}>{err}</p>}
 {busy && <div style={{ marginTop: 14, display: "grid", gap: 8 }}>{[0,1,2].map((i) => <div key={i} className="skel" style={{ height: 18 }} />)}</div>}
 {out && (
 <div className="rise" style={{ ...card, marginTop: 16 }}>
 <div style={{ ...label, color: C.accent, marginBottom: 10 }}>Draft listing</div>
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

function SettingsPage({ db, put, reset, user, signOut }) {
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
 const on = (db.profile.theme || "heat") === id;
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
 <span style={{ fontFamily: MONO, color: C.accent, fontWeight: 600 }}>{db.profile.radius} mi</span>
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

 <Group title="Billing">
 <Row l="Plan" r="Free" />
 <Field label="Starting balance" value={db.settings.startingBalance} type="number" prefix="$"
 onChange={(v) => put("settings", { ...db.settings, startingBalance: +v || 0 })} />
 <p style={{ fontSize: 11.5, color: C.dead, marginTop: 6, lineHeight: 1.6 }}>
 Current Balance on Home = this number + realized profit from every sale you've logged.
 Needs a real payment provider (e.g. Stripe) before real charges — card numbers must never
 touch this app directly.
 </p>
 </Group>

 <Group title="Privacy & security">
 <button onClick={() => { if (confirm("Erase all your data? This can't be undone.")) reset(); }} className="fx fx-chip"
 style={{ ...pillBtn(false), width: "100%", padding: "13px", borderColor: C.accentDim, color: C.accent, fontWeight: 700 }}>
 Erase all my data
 </button>
 </Group>
 </div>
 );
}

const Toggle = ({ label: l, on, onToggle }) => (
 <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", cursor: "pointer" }}>
 <span style={{ fontSize: 13.5 }}>{l}</span>
 <button role="switch" aria-checked={on} aria-label={l} onClick={onToggle}
 style={{ width: 44, height: 25, borderRadius: 999, border: "none", cursor: "pointer", background: on ? C.accent : C.raised, position: "relative", transition: "background .2s" }}>
 <span style={{ position: "absolute", top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: 999, background: "#fff", transition: "left .2s cubic-bezier(.2,.7,.3,1)" }} />
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

function FloatingAI({ db, biz, page, focus, user }) {
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
WATCHLIST: ${db.watchlist.map((w) => w.title).join("; ") || "empty"}
GOALS: ${db.goals.map((g) => `${g.done ? "[done] " : ""}${g.text}`).join("; ") || "none set"}`;

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

 return (
 <>
 <button onClick={() => setOpen(true)} aria-label="Open AI assistant" className="fx fx-accent"
 style={{ position: "fixed", bottom: "calc(88px + env(safe-area-inset-bottom, 0px))", right: 18, width: 52, height: 52, borderRadius: 999, background: C.accent, border: "none", cursor: "pointer", zIndex: 45, boxShadow: "0 10px 28px -8px rgba(0,0,0,.5)", display: open ? "none" : "grid", placeItems: "center" }}>
 <Sparkles size={21} color="#fff" />
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
 return (
 <div style={{ marginBottom: 14, flex: 1 }}>
 <div style={{ ...label, marginBottom: 8 }}>{l}</div>
 <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.raised, border: `1px solid ${C.line}`, borderRadius: 999, padding: "0 16px" }}>
 {prefix && <span style={{ fontFamily: MONO, fontSize: big ? 20 : 14, color: C.dim }}>{prefix}</span>}
 <input type={type} value={value} placeholder={placeholder} inputMode={type === "number" ? "decimal" : undefined}
 onChange={(e) => onChange(e.target.value)}
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
 style={{ width: "100%", padding: "15px 16px", borderRadius: 999, border: "none", marginTop: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 14.5, fontWeight: 800, background: disabled ? C.raised : C.accent, color: disabled ? C.dead : "#fff" }}>
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
 style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 999, padding: "13px 26px", cursor: "pointer", fontSize: 13.5, fontWeight: 700, marginTop: 20 }}>{cta}</button>
 )}
 </div>
 );
}
