// ═══════════════════════════════════════════════════════════════
// supabase/functions/ai-assistant/index.ts
//
// Server-side Claude endpoint. Adapted from the bundle's Node/Vercel
// handler to Supabase Edge Functions (Deno), because that is where this
// project's backend already lives — product-search, market-research and
// auth-callback are all deployed here, and the Vite frontend is a static
// SPA with no /api routes of its own.
//
// ANTHROPIC_API_KEY is read from the function's environment and never
// leaves this file. Set it with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Deploy with (verify_jwt on, so anonymous traffic can't spend credits):
//   supabase functions deploy ai-assistant
// ═══════════════════════════════════════════════════════════════

import Anthropic from "npm:@anthropic-ai/sdk@^0.70.0";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5";

// Stable half of the system prompt. Kept byte-identical across requests so
// it can be prompt-cached — anything that changes per request (the date,
// per-user context) goes in a second block below the cache breakpoint.
const SYSTEM_PROMPT = `
You are an advanced, general-purpose AI assistant embedded inside a web application.

YOUR PURPOSE

Help users with virtually any legitimate question they ask.

You are not limited to one subject. You can assist with general knowledge,
science, mathematics, technology, software development, debugging, business,
marketing, entrepreneurship, history, geography, education, research, writing,
editing, brainstorming, analysis, comparisons, explanations, translation,
everyday questions, current events, products and services, Claude AI,
Anthropic, the Claude API, Claude Code, AI models, prompt engineering, and
other reasonable topics.

CORE BEHAVIOR

1. Understand what the user is actually asking.
2. Answer the question directly.
3. Do not unnecessarily restrict the conversation to Claude or AI.
4. For stable information that you know confidently, answer directly.
5. For information that may be current, changing, obscure, niche, or
   uncertain, use web search. Examples: current events, today's information,
   politics, prices, product specifications, company leadership, sports,
   schedules, laws or regulations, software versions, new scientific
   developments, current AI models, Anthropic products, Claude capabilities,
   Claude pricing, recent releases.
6. If the user explicitly asks you to search, verify, check, research, or look
   something up, use web search.
7. When answering questions about Claude or Anthropic, strongly prefer current
   official Anthropic sources when available.
8. Never fabricate facts, sources, citations, quotations, statistics, URLs,
   prices, model names, software features, research papers, legal rules, or
   medical facts.
9. If something cannot be established reliably, explain the uncertainty.
10. If trustworthy sources disagree, explain the disagreement rather than
    pretending there is consensus.
11. Preserve context from earlier messages.
12. Follow-up questions may refer to previous responses indirectly. Resolve
    those references from conversation history.
13. Match the user's preferred language.
14. Match the user's requested level of detail.
15. For coding questions: reason about the existing stack when context is
    provided, provide complete working examples when appropriate, flag
    security issues, never expose private API keys, and distinguish browser
    code from server code.
16. For math: work carefully and verify calculations before presenting them.
17. For writing requests: produce polished, useful writing that follows the
    tone, length, audience, and format requirements.
18. For research: prioritize primary and authoritative sources, compare
    sources when necessary, and clearly distinguish fact from inference.
19. Do not claim certainty when certainty is not justified.
20. Be useful, professional, clear, and conversational.

WEB RESEARCH RULE

Use web search whenever fresh external information would materially improve
the answer. Do not search unnecessarily for simple conversation, basic
mathematics, established facts, rewriting, or creative work.

Your goal is not merely to generate text. Your goal is to give the user the
most accurate, useful, well-grounded answer available from your reasoning and
tools.
`.trim();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Drop anything malformed, cap history depth, and bound each message. */
function cleanConversation(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));
}

function extractAnswer(content: any[]): string {
  return content
    .filter((b) => b?.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

/** Web-search citations ride on text blocks; de-duplicate by URL. */
function extractSources(content: any[]): { title: string; url: string }[] {
  const sources = new Map<string, { title: string; url: string }>();
  for (const block of content) {
    if (block?.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const citation of block.citations) {
      const url = citation?.url ?? citation?.source;
      if (typeof url !== "string" || !url.startsWith("http")) continue;
      if (sources.has(url)) continue;
      sources.set(url, {
        title: citation?.title ?? citation?.document_title ?? url,
        url,
      });
    }
  }
  return [...sources.values()].slice(0, 10);
}

async function askClaude(
  messages: ChatMessage[],
  appContext: string,
  useWebSearch = true,
) {
  // Volatile half of the system prompt, below the cache breakpoint so it
  // never invalidates the cached prefix above it.
  const volatile = [
    `CURRENT DATE\nThe server date is: ${new Date().toISOString()}`,
    appContext.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const request: Record<string, unknown> = {
    model: MODEL,
    max_tokens: 16000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: volatile },
    ],
    messages,
  };

  // Anthropic's server-side web search. Claude decides per request whether it
  // actually needs to search — a stable factual question does not trigger one.
  if (useWebSearch) {
    request.tools = [
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    ];
  }

  let response = await anthropic.messages.create(request as any);

  // Server tools can return pause_turn while work is still in flight. Continue
  // the same turn rather than presenting a half-finished answer.
  let continuations = 0;
  while (response.stop_reason === "pause_turn" && continuations < 3) {
    continuations += 1;
    request.messages = [
      ...(request.messages as ChatMessage[]),
      { role: "assistant", content: response.content } as any,
    ];
    response = await anthropic.messages.create(request as any);
  }

  return response;
}

/* The account making the request, from the token the gateway has already
   verified. Decoding it here is for identifying the caller, not for
   trusting them — an unverified token never reaches this function. */
function callerUserId(req: Request): string | null {
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    /* base64url, and JWT strips the padding. atob wants standard base64 with
       padding intact, so put both back before decoding. */
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    return JSON.parse(atob(b64))?.sub || null;
  } catch {
    return null;
  }
}

/* Limits are settable without a deploy.

   Deploying product-search means pasting thirty-four kilobytes into an API
   call, where one mistyped character in a regex takes search down for every
   paying customer. Tuning a number should never require running that risk,
   and these numbers are explicitly meant to be retuned once a real month of
   usage has been billed.

   A value that will not parse falls back to the constant below it, never to
   something larger: getting this wrong in the safe direction costs a
   refused request, getting it wrong the other way costs money quietly. */
const envWhole = (name: string, fallback: number): number => {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${name} is "${raw}", which is not a whole number >= 1. Using ${fallback}.`);
    return fallback;
  }
  return Math.min(n, fallback * 10);   // a typo'd extra zero is not a policy change
};

/* How many questions an account may ask in a three-hour window.

   The assistant had no limit at all, which was the largest uncapped cost in
   the product: premium is checked, and a premium account could then ask
   without end, each answer allowed up to 16k tokens on the largest model.
   One person could run up a serious bill in an afternoon, deliberately or
   by leaving something looping.

   Forty per three hours is chosen to be invisible. A real conversation is
   five to fifteen messages, so nobody using this normally will ever see it,
   while the worst case per account becomes a number you can budget for.

   Not every question here is typed by a person. Product descriptions, the
   listing generator and AI Discover all spend from this same allowance, so
   a subscriber can reach the limit without ever opening the chat. That is
   correct — they all cost the same money — but it means forty is not forty
   conversations.

   A window is there to bound a burst, and somebody working through a problem
   asks a dozen questions and stops; an hourly cut-off interrupted that while
   still permitting far more per day. */
const ASK_MAX = envWhole("ASK_MAX", 40), ASK_WINDOW = envWhole("ASK_WINDOW_SECONDS", 3 * 60 * 60);

/* And how many in a month. This one is now sized from measured cost.

   The short window stops a burst. It does nothing about sustained use:
   forty every three hours, around the clock, is legal under it and comes to
   nine thousand questions a month from one account paying $25. Even a human
   asking steadily through a working day costs more than they pay.

   Fifty, because the arithmetic was finally done. One question on
   claude-opus-5 is roughly 2–4k input tokens at $5/MTok plus whatever of
   the 16k max_tokens the answer and its thinking use at $25/MTok — about
   three to ten cents typically, and forty-two at the cap. Fifty questions
   is therefore $1.50–5 normally and $21 in the pathological case, against
   $25 of revenue. That satisfies the rule this number exists for: a
   subscriber who maxes out still costs less than they pay. Two hundred and
   fifty did not — it was $12–25 typically and over $100 at the cap.

   What it costs in generosity is real and should not be hidden: fifty is
   about one and a half window-fulls, and four features draw on this
   allowance, not just the chat. Twenty product descriptions and a few
   listings is most of somebody's month. If subscribers complain, this is
   the number to move — and move it with a measured cost per question in
   hand, which is now possible where it was not before.

   Rolling rather than calendar: the window starts on the first question
   and resets thirty days later, which is what the counter already does. */
const ASK_MONTH_MAX = envWhole("ASK_MONTH_MAX", 50), ASK_MONTH_WINDOW = 30 * 24 * 60 * 60;

/* Both windows together. Reporting only the three-hour balance would read
   as "40 left" to somebody the monthly cap is refusing. */
async function bothQuotas(asker: string) {
  const [window, month] = await Promise.all([
    quotaFor(`ask:${asker}`, ASK_MAX, ASK_WINDOW),
    quotaFor(`ask:month:${asker}`, ASK_MONTH_MAX, ASK_MONTH_WINDOW),
  ]);
  return window ? { ...window, month } : null;
}

/* What is left, without spending any of it.

   A cap nobody can see is indistinguishable from the app being broken: you
   ask a question, nothing comes back, and there is no way to learn why. So
   the count is readable and Settings shows it, the same way it shows the
   search allowance.

   Read straight from the table rather than through consume_rate_limit,
   whose whole job is to increment — checking your own balance must not
   cost you one of them. */
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
    console.error("ai-assistant: quota read failed:", String(e));
    return null;
  }
}

/* Counted in Postgres, because Edge Functions run on many instances and an
   in-process counter is bypassed by whoever lands on a different one.

   Fails open, like the other two limiters: if the database cannot be
   reached, questions still get answered. A limiter that silences the
   product when it breaks is worse than the spending it prevents. */
async function allow(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return true;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) {
      console.error("ai-assistant: rate limit check failed:", res.status, (await res.text()).slice(0, 200));
      return true;
    }
    return (await res.json()) !== false;
  } catch (e) {
    console.error("ai-assistant: rate limit check threw:", String(e));
    return true;
  }
}

/* Has this caller paid?

   The entitlement is read with the service role, because the entitlements
   table is deliberately unreadable and unwritable by the browser except for
   the caller's own row.

   Every failure answers false. A malformed token, a missing row, an expired
   plan, a database that will not answer — all of it is "not premium". The
   only way through is a live row that says otherwise. */
async function callerIsPro(req: Request): Promise<boolean> {
  try {
    const userId = callerUserId(req);
    if (!userId) return false;

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      console.error("ai-assistant: cannot check entitlement, SUPABASE_URL or service role key missing.");
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
    console.error("ai-assistant: entitlement check failed:", String(e));
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  /* Checked before the key is even looked at, so a free account cannot spend
     a cent of model credit. The UI hides the assistant too, but hiding is
     not enforcing — this is the half that holds if someone edits the page. */
  if (!(await callerIsPro(req))) {
    return json({ error: "The assistant is a premium feature. Upgrade in Settings to use it.", upgrade: true }, 402);
  }

  const asker = callerUserId(req);

  /* "How many questions do I have left?" — answered without spending one.
     Read before the body is examined for messages, because a peek carries
     none and would otherwise be rejected as an empty conversation. */
  const peeking = await req.clone().json().then((b) => b?.peek === true).catch(() => false);
  if (peeking) {
    return json({ quota: await bothQuotas(asker ?? "unknown") });
  }

  /* After the premium check, so a free account hammering the endpoint cannot
     burn through somebody else's allowance, and before the model is called,
     so a refusal costs nothing. */
  /* Both consumed together rather than in sequence: two awaits in a row
     would let a request slip between them under load, and the pair is what
     bounds the spend. Refused if either says no. */
  const id = asker ?? "unknown";
  const [windowOk, monthOk] = await Promise.all([
    allow(`ask:${id}`, ASK_MAX, ASK_WINDOW),
    allow(`ask:month:${id}`, ASK_MONTH_MAX, ASK_MONTH_WINDOW),
  ]);
  if (!windowOk || !monthOk) {
    console.warn(`ai-assistant: rate limited (${!windowOk ? "window" : "month"}).`);
    return json({
      error: windowOk
        ? "You've asked all your questions for this month. They refresh at the start of your next cycle."
        : "You've asked all your questions for now. They refresh every 3 hours.",
      quota: await bothQuotas(id),
    }, 429);
  }

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    console.error("ANTHROPIC_API_KEY is not set on this function.");
    return json({ error: "The AI service is not configured." }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = cleanConversation(body?.messages);
    const appContext = typeof body?.context === "string" ? body.context : "";

    if (messages.length === 0) {
      return json({ error: "Please send a message." }, 400);
    }
    if (messages[messages.length - 1].role !== "user") {
      return json({ error: "The conversation must end with a user message." }, 400);
    }

    let response: any;
    try {
      response = await askClaude(messages, appContext, true);
    } catch (webError: any) {
      // Some organizations have web search disabled in Console settings. If
      // that is what failed, retry without it rather than taking the whole
      // assistant down.
      const message = String(webError?.message ?? "").toLowerCase();
      const webSearchUnavailable =
        webError?.status === 400 &&
        (message.includes("web search") || message.includes("web_search"));

      if (!webSearchUnavailable) throw webError;
      console.warn("Web search unavailable — retrying without it.");
      response = await askClaude(messages, appContext, false);
    }

    // Safety classifiers can decline a request: HTTP 200, stop_reason
    // "refusal", empty or partial content. Check before reading content.
    if (response.stop_reason === "refusal") {
      return json({
        answer:
          "I can't help with that particular request. Try rephrasing it, or ask me something else.",
        sources: [],
      });
    }

    const answer = extractAnswer(response.content);
    const sources = extractSources(response.content);

    if (!answer) {
      return json({ error: "The AI service returned an empty response." }, 502);
    }

    return json({
      answer,
      sources,
      /* Sent back on every answer so a caller can track the balance as it is
         spent, rather than only when Settings is opened. */
      quota: await bothQuotas(asker ?? "unknown"),
      meta: {
        model: response.model ?? MODEL,
        stopReason: response.stop_reason,
        usage: response.usage ?? null,
      },
    });
  } catch (error: any) {
    console.error("ai-assistant error:", error);

    if (error?.status === 429) {
      return json(
        { error: "The assistant is busy right now. Please try again shortly." },
        429,
      );
    }
    if (error?.status === 401 || error?.status === 403) {
      return json({ error: "The AI service authentication is not configured correctly." }, 500);
    }
    return json({ error: "I couldn't complete that request. Please try again." }, 500);
  }
});
