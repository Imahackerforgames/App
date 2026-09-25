# AI Assistant Integration

## Architecture

```
Browser
  → src/components/AIAssistant.jsx
  → POST {SUPABASE_URL}/functions/v1/ai-assistant   (JWT required)
  → Anthropic Messages API  (+ server-side web search when Claude decides it needs it)
  → { answer, sources, meta }
  → browser
```

The endpoint is a **Supabase Edge Function**, not `/api/ai-assistant`. This
project is a static Vite SPA with no server of its own; Supabase Edge Functions
are where its backend already lives (`product-search`, `market-research`,
`auth-callback`). A `/api/*` route would 404 in both `npm run dev` and a static
deploy.

## Files

| Path | Role |
|---|---|
| `src/components/AIAssistant.jsx` | Chat UI, conversation state, fetch to the function |
| `supabase/functions/ai-assistant/index.ts` | Server-side Claude call (Deno) |
| `src/App.jsx` → `FloatingAI` | Mounts `<AIAssistant/>` in the floating assistant sheet |

## Critical security rule

`ANTHROPIC_API_KEY` is **server-side only**. It lives as a Supabase secret and
is read only inside the Edge Function.

Never:
- expose it in frontend code
- rename it `VITE_ANTHROPIC_API_KEY` (anything `VITE_`-prefixed is bundled into
  the browser)
- commit it to git
- return it from an API
- log it

The Anthropic SDK is imported inside the Deno function via an `npm:` specifier.
It is deliberately **not** in `package.json` — adding it there would ship an API
client into the browser bundle.

## Setup

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai-assistant
```

The function requires a JWT (`verify_jwt` defaults on), so anonymous traffic
cannot spend API credits. The client sends the signed-in user's access token.

## Request / response

```jsonc
// POST body
{
  "messages": [{ "role": "user", "content": "..." }],  // required, must end on a user turn
  "context":  "..."                                     // optional, appended below the system prompt
}

// 200
{ "answer": "...", "sources": [{ "title": "...", "url": "..." }], "meta": { ... } }

// error
{ "error": "human-readable message" }
```

`context` is **appended to** the general-purpose system prompt, never replaces
it. That keeps the assistant able to answer anything while also knowing the
user's inventory, sales, and this app's rules (see `FloatingAI` in `App.jsx`).

## System prompt is split in two

- **Stable block** — the general-purpose prompt, marked `cache_control:
  ephemeral` so it prompt-caches across requests.
- **Volatile block** — current date plus the per-user `context`, placed *below*
  the cache breakpoint.

Do not move the date back into the stable block. A value that changes every
request at the front of the prefix invalidates the cache for everything after
it.

## Model and tool notes

- Model is `claude-opus-5`, overridable with the `CLAUDE_MODEL` secret.
- Web search uses `web_search_20260209`. Claude decides per request whether a
  search is warranted; stable factual questions don't trigger one.
- Do **not** add `temperature`, `top_p`, or `top_k` — they are rejected with a
  400 on this model family.
- Thinking is on by default on `claude-opus-5`, and `max_tokens` caps thinking
  *plus* response text together. That's why `max_tokens` is 16000, not 4096.
- `pause_turn` is handled: the function continues the same turn (max 3 hops)
  rather than returning a half-finished answer.
- `stop_reason: "refusal"` is checked before reading content.

## Everything goes through the Edge Function now

`askClaude` in `App.jsx` used to call `api.anthropic.com` straight from the
browser, which cannot work — no CORS headers, and the key would be exposed
even if it did. It surfaced as "Load failed" and broke product descriptions,
the AI Discover and market-research fallbacks, and the listing generator.

All four now route through `ai-assistant` and work. If you are reading this
section expecting them to be broken, that information is out of date.

## Payments

Premium is granted by `supabase/functions/stripe-webhook`, which writes to
`entitlements` when Stripe reports a payment. `verify_jwt` is off — Stripe
has no Supabase session to send — so the signature check is the entire
security boundary, and without it anyone who found the URL could POST
themselves a pro row.

The account is matched by `client_reference_id`, appended to the payment
link by `openCheckout`. Only the first event knows who paid; renewals and
cancellations carry a Stripe customer and nothing else, which is why
`entitlements.stripe_customer_id` records the mapping at checkout time.

Secrets, both server-side only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

`docs/granting-premium.md` covers granting by hand, which is still how
comped accounts work.

## Limits

Enforced in Postgres via `consume_rate_limit`, so they hold across Edge
Function instances. All fail open — a limiter that silences the product
when the database is unreachable is worse than the spending it prevents.

| What | Limit | Per |
|---|---|---|
| Sign-in attempts | 10/hour | IP address |
| Sign-in attempts | 6/hour | username |
| Product searches | 35/hour | account |
| Assistant questions | 40/hour | account |

Both search and assistant answer a `{ peek: true }` request with the
balance without spending any of it. Settings reads them that way.

## There is no demo mode

Sign-in used to fall back to a fake session when the network failed. It was
a development convenience and a data-loss bug: the session had no account
id, so everything the person entered was stored under a key their real
account would never read. `tests/nodemo.mjs` exists to keep it gone.
