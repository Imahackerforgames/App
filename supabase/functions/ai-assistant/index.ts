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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
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
