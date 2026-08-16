// ═══════════════════════════════════════════════════════════════
// src/lib/tavily.ts
//
// Drop this into your repo. It calls the two Edge Functions already
// deployed to your Supabase project.
//
// The Tavily API key is NOT in this file and must never be. It lives
// as a Supabase secret and is only ever read inside the Edge Function.
// ═══════════════════════════════════════════════════════════════

import { supabase } from "./supabaseClient"; // your existing client

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** Both functions require a signed-in user, so credits can't be burned
 *  by anonymous traffic. Throws early with a clear message if signed out. */
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to search.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

export interface Listing {
  title: string;
  url: string;
  market: string;
  snippet: string;
  image: string | null;
}

/** Real, purchasable listings. Domain-restricted server-side to the seven
 *  resale marketplaces — news and blogs are excluded at the source. */
export async function searchProducts(
  query: string,
  mode: "online" | "local" = "online",
  maxResults = 10,
): Promise<Listing[]> {
  const res = await fetch(`${FN_BASE}/product-search`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ query, mode, maxResults }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed.");
  return data.results ?? [];
}

export interface Research {
  answer: string;
  sources: { title: string; url: string; snippet: string; published: string | null }[];
  retrievedAt: string;
  ageHours: number | null;
  stale: boolean;
}

/** Current market info for the chatbot. Returns sources so the assistant
 *  can cite rather than assert, plus a staleness flag. */
export async function researchMarket(
  question: string,
  depth: "basic" | "advanced" = "basic",
): Promise<Research> {
  const res = await fetch(`${FN_BASE}/market-research`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ question, depth }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Research failed.");
  return data;
}

// ═══════════════════════════════════════════════════════════════
// WIRING IT INTO THE CHATBOT
//
// The important part is ROUTING. Don't call Tavily for everything —
// it costs money and it's slower. Your own spec had this right:
//
//   "What did I make this month?"  → Supabase, no web search
//   "What's in my inventory?"      → Supabase, no web search
//   "What's trending right now?"   → Tavily
//   "Find Jordan 4 listings"       → Tavily
//
// A cheap way to decide, before spending a Tavily call:
// ═══════════════════════════════════════════════════════════════

const WEB_HINTS = [
  "trending", "trend", "right now", "this week", "currently", "latest",
  "market", "popular", "demand", "going for", "worth", "hot", "news",
];
const OWN_DATA_HINTS = [
  "my ", "i made", "i sold", "i have", "my inventory", "my sales",
  "my profit", "this month", "restock", "slowest", "best product",
];

export function needsWebSearch(question: string): boolean {
  const q = question.toLowerCase();
  if (OWN_DATA_HINTS.some((h) => q.includes(h))) return false;
  return WEB_HINTS.some((h) => q.includes(h));
}

/* Example use in your chat handler:
 *
 *   let context = await loadUserBusinessData(userId);   // Supabase
 *
 *   if (needsWebSearch(question)) {
 *     const r = await researchMarket(question);
 *     context += `\n\nMARKET RESEARCH (observed, retrieved ${r.retrievedAt}):\n`;
 *     context += r.answer + "\n\nSources:\n";
 *     context += r.sources.map(s => `- ${s.title}: ${s.url}`).join("\n");
 *     if (r.stale) context += "\n\nNOTE: newest source is over 45 days old.";
 *   }
 *
 *   const reply = await callYourLLM(context, question);
 *
 * Tell the model in its system prompt to label claims:
 *   verified  = from the user's own database records
 *   observed  = found via Tavily just now
 *   estimated = calculated
 *   predicted = the model's own inference
 */
