import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ═══════════════════════════════════════════════════════════════
   market-research — Tavily for the chatbot.

   Different job from product-search. That one finds listings you can buy;
   this one answers questions like "what's trending in sneakers right now"
   and hands back SOURCES so the assistant can cite instead of assert.

   ── Why this file exists in the repo now ───────────────────────
   It was deployed but never committed, so nobody reviewing the project
   could see that it existed, let alone that it had no premium check and
   no rate limit. verify_jwt alone means any signed-in account — free
   included — could call it directly and spend Tavily credits without
   limit. Nothing in the app calls it, which made it worse, not better:
   an endpoint nobody uses is an endpoint nobody watches.

   It now enforces the same two things product-search does.
   ═══════════════════════════════════════════════════════════════ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* The app must never display a buy price the user didn't enter. Scrub any
   dollar figure out of snippets before they can reach the assistant. */
const stripPrices = (t: string) =>
  (t || "").replace(/\$\s?[\d,]+(\.\d{1,2})?/g, "").replace(/\s{2,}/g, " ").trim();

/* Who is asking. verify_jwt is on, so the gateway has already verified the
   token before this runs — reading the subject is for identifying the
   caller, not for trusting them. */
function callerId(req: Request): string {
  try {
    const raw = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    const claims = JSON.parse(atob(raw.split(".")[1]));
    if (claims?.sub) return `user:${claims.sub}`;
  } catch {}
  return `ip:${(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"}`;
}

/* Has this caller paid? Every failure answers false — a malformed token, a
   missing row, an expired plan, a database that will not answer. The only
   way through is a live row that says pro. */
async function callerIsPro(req: Request): Promise<boolean> {
  try {
    const id = callerId(req);
    if (!id.startsWith("user:")) return false;
    const userId = id.slice(5);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("market-research: cannot check entitlement, SUPABASE_URL or service role key missing.");
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
    console.error("market-research: entitlement check failed:", String(e));
    return false;
  }
}

/* Fails open, like every other limiter here: a limiter that silences the
   product when the database is unreachable is worse than the spending it
   prevents. */
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
      console.error("market-research: rate limit check failed:", res.status, (await res.text()).slice(0, 200));
      return true;
    }
    return (await res.json()) !== false;
  } catch (e) {
    console.error("market-research: rate limit check threw:", String(e));
    return true;
  }
}

/* Deliberately the SAME bucket product-search uses.

   Both spend the same Tavily budget, so two separate allowances would mean
   an account could exhaust one and carry straight on spending through the
   other. One budget, one counter. */
const SEARCH_MAX = 25, SEARCH_WINDOW = 60 * 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const key = Deno.env.get("TAVILY_API_KEY");
    if (!key) {
      return json({
        error: "TAVILY_API_KEY is not set.",
        fix: "Supabase dashboard → Edge Functions → Secrets → add TAVILY_API_KEY",
      }, 500);
    }

    const {
      question,
      depth = "basic",      // "advanced" for harder market questions
      days = 30,             // recency window
      maxResults = 6,
    } = await req.json();

    if (!question || typeof question !== "string" || !question.trim()) {
      return json({ error: "Missing 'question'." }, 400);
    }

    /* Premium, then the shared allowance — both before a credit is spent.
       A free account must not be able to spend anything here, and neither
       refusal may cost anything to make. */
    if (!(await callerIsPro(req))) {
      return json({ error: "Market research is a premium feature. Upgrade in Settings to use it.", upgrade: true }, 402);
    }
    if (!(await allow(`search:${callerId(req)}`, SEARCH_MAX, SEARCH_WINDOW))) {
      console.warn("market-research: rate limited.");
      return json({ error: "You've used all your searches for this hour. They refresh shortly." }, 429);
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: question.trim(),
        search_depth: depth === "advanced" ? "advanced" : "basic",
        topic: "general",
        days,
        max_results: Math.min(Number(maxResults) || 6, 12),
        include_answer: true,      // Tavily's own synthesis, used as a hint
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Tavily returned ${res.status}`, detail }, 502);
    }

    const data = await res.json();
    const now = new Date();

    const sources = (data.results ?? []).map((r: any) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: stripPrices(String(r.content ?? "")).slice(0, 320),
      published: r.published_date ?? null,
      score: r.score ?? null,
    })).filter((r: any) => r.url);

    /* Freshness signal. If the newest source is old, the app should say so
       instead of presenting stale numbers as current. */
    const dates = sources.map((s: any) => s.published)
      .filter(Boolean).map((d: string) => new Date(d).getTime())
      .filter((t: number) => !isNaN(t));
    const newest = dates.length ? Math.max(...dates) : null;
    const ageHours = newest ? Math.round((now.getTime() - newest) / 36e5) : null;

    return json({
      question,
      answer: stripPrices(String(data.answer ?? "")),
      sources,
      count: sources.length,
      retrievedAt: now.toISOString(),
      ageHours,
      stale: ageHours !== null && ageHours > 24 * 45,
      dataType: "observed",   // observed, not verified — it's web content
    });
  } catch (e) {
    return json({ error: "Research failed.", detail: String(e) }, 500);
  }
});
