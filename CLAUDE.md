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

Premium is granted by `supabase/functions/commas-webhook`, which writes to
`entitlements` when Commas reports a payment. `verify_jwt` is off — Commas
has no Supabase session to send — so the HMAC-SHA256 signature check is the
entire security boundary, and without it anyone who found the URL could
POST themselves a pro row. A signature failure answers 401, which is what
Commas asks for.

Commas is the **merchant of record**: they are the seller on the
customer's statement and they carry the tax and compliance for the sale.

Checkout is minted per person by `supabase/functions/commas-checkout`
rather than being a link in the bundle. There is nothing to paste and no
account id in a query string: the function reads the caller from the token
it verifies and puts it in the session's `metadata`, and Commas returns it
on the payment webhook. That is the whole mechanism by which money becomes
premium, and it is now out of the customer's reach.

Commas is the rebranded FanBasis and the API still answers on the FanBasis
host. Two details are worth not re-deriving, because getting either wrong
produces a 401 that reads exactly like a bad key:

- base `https://www.fanbasis.com`, every endpoint under `/public-api/`
  (sandbox: `https://qa.dev-fan-basis.com`, via `COMMAS_API_BASE`)
- the key goes in an **`x-api-key`** header, not `Authorization: Bearer`

`POST /public-api/checkout-sessions` requires `product.title`,
`amount_cents` and `type`, plus `subscription.frequency_days` when `type`
is `subscription`; `metadata` and `success_url` are accepted; the response
carries `payment_link`.

The `payment_link` it returns is on a **different host from the API** —
`https://commas.com/checkout/<token>`, observed on a real session. So
`commas.com` is the customer-facing brand and `www.fanbasis.com` is the
API. Neither one substitutes for the other; sending API calls to
commas.com is a plausible-looking guess that will not work.

Secrets, both server-side only: `COMMAS_API_KEY`, `COMMAS_WEBHOOK_SECRET`.

Field names inside the webhook payload have not yet been seen against a
real event, so every read tries several spellings and unhandled events are
logged in full. Collapse those to one path once a real payload has
arrived — and delete this paragraph when they are no longer guesses.

Nobody can buy it twice. Every upgrade button is hidden from a premium
account, `openCheckout` refuses outright when `checkoutIsPro`, and
`commas-checkout` checks the database again before spending anything —
hiding a control is a drawing decision, and this is the one that spends
money. Two subscriptions on one account is one person charged twice for
one thing: a refund, an apology and quite possibly a chargeback.

Subscription events carry only the customer, so the account is found by
customer — fine with one subscription, wrong with two, because cancelling
either looks identical and would switch the account off while the other
kept charging. `commas_subscription_id` records which subscription the
account is actually on, and an event about any other one is left alone.

## Leaving

Settings → Billing offers a premium member **Cancel subscription**, which
opens a prefilled email to `SUPPORT_EMAIL`. No form, no reason, no
retention flow, and the copy promises the time already paid for.

That is a placeholder and should be replaced with a real one-tap cancel as
soon as the Commas subscriptions endpoint is confirmed — but it is an
honest one, which the alternative was not. Stripe's own portal used to sit
here and was the right answer while Stripe took the money. Left in place
it would have been actively harmful: `billing-portal` answers
`no_subscription` for every account now, and the app rendered that as
"nothing is being charged" — a comforting sentence shown to somebody whose
card is charged monthly. A button that tells a paying customer they are not
paying is how a cancellation becomes a chargeback. `tests/billing.mjs`
fails if it comes back.

Removing premium from somebody who pays means cancelling with Commas, not
clearing the row. A live subscription re-grants `pro` at the next renewal
event and the revoke silently undoes itself, so `revoke_premium` returns a
warning naming the subscription when one is recorded.

## Stripe is gone

It was the processor until the switch to Commas. The payment links are
deactivated, every subscription on that account is cancelled, no Stripe
function is deployed, and nothing in `src/` calls Stripe.
`stripe-webhook` and `billing-portal` stay in `supabase/functions` with a
`RETIRED` header, as the record of how it worked — including the 52.08%
partner split and why that number was not 50.

Two things from that period are still worth knowing.

**A processor that splits payments automatically is a feature you can
lose.** Stripe divided every charge at the moment the card was charged, on
the first payment and each renewal. Whether Commas can pay a second party
is unconfirmed, so a partner split is currently a manual transfer. Settle
that before promising anyone a percentage.

**A secret that is the wrong kind of string still looks set.**
`STRIPE_SECRET_KEY` held an API key's *id* rather than the key (`mk_...`,
which the dashboard shows right next to the key itself),
`subscriptions.retrieve` threw, the handler returned 500, and a completed
checkout granted nothing for a day. The payment was never in doubt — only
an expiry lookup was — so nothing about that failure should have reached
the customer. Hence two habits worth keeping in anything new: check a
key's shape at boot and log the diagnosis there, and never let an optional
lookup fail a grant.

## Granting by hand

`docs/granting-premium.md` covers granting and removing by hand, which is
still how comped accounts and support fixes work. Two helpers installed by
`supabase/migrations/002_premium_helpers.sql` make it one call:

```sql
select grant_premium('them@example.com', 30);
select revoke_premium('them@example.com');
```

Both are SECURITY DEFINER and both have `EXECUTE` revoked from `PUBLIC`.
That revoke is the entire access control, not tidying: Postgres grants
`EXECUTE` to `PUBLIC` by default, `PUBLIC` includes `anon` and
`authenticated`, and a SECURITY DEFINER function runs with its owner's
rights — so without it any signed-in visitor could promote themselves.
Revoking from `anon` and `authenticated` by name would not help; the grant
lives on `PUBLIC` and they inherit it. `tests/premiumfns.mjs` fails if
either line is removed.

## Limits

Enforced in Postgres via `consume_rate_limit`, so they hold across Edge
Function instances. All fail open — a limiter that silences the product
when the database is unreachable is worse than the spending it prevents.

| What | Limit | Per |
|---|---|---|
| Sign-in attempts | 10/hour | IP address |
| Sign-in attempts | 6/hour | username |
| Product searches | 40 per **3 hours** **and 150/month** | account |
| Market research | shares the search buckets | account |
| Assistant questions | 60 per **3 hours** **and 250/month** | account |

The short window is three hours, not one. That is a bigger single sitting
and a **lower** sustained rate than before: an hourly 25 allowed 75 searches
in any three hours, where 40 per three hours allows 40. Somebody
researching properly does twenty searches in an evening and then stops, and
an hourly cut-off interrupted that while still permitting far more per day.

`product-search` and `market-research` share one counter row, so both must
declare the same `SEARCH_MAX` and `SEARCH_WINDOW`. A mismatch would make
the reset time depend on which endpoint was called last.

Both search and assistant answer a `{ peek: true }` request with the
balance without spending any of it. Settings reads them that way.

Two windows, because one cannot do the other's job. The short limit stops
a burst; it says nothing about sustained use. Sixty questions every three
hours, around the clock, is legal under it and comes to 14,000 questions a
month from one account paying $25 — and even a human asking steadily
through a working day costs more than they pay. The monthly cap is what
makes a single account unable to cost more than it brings in.

**The monthly assistant cap is the number most likely to lose money.** At
250 questions on `claude-opus-5` with `max_tokens` 16000, a subscriber who
maxes it out plausibly costs more in tokens than the $25 they pay. Nobody
has measured it, so it has not been changed on a guess — but it is the
first thing to check against a real bill, and the rule it has to satisfy is
simple: a subscriber who maxes out must still cost less than they pay.

Both are deliberately far above normal use. They are not there to shape
behaviour, only to bound the worst case.

Set them from measured cost per question, not from intuition. The numbers
here were chosen before that measurement existed and should be revisited
once one real month of usage has been billed.

The search number is low because one call is not one Tavily credit. It
fans out to a search per marketplace plus a page extract, so a call costs
five or six credits and an analysis costs around a dozen. Forty per three
hours is about 240 credits per window for one account, and the monthly cap
of 150 is roughly 900 credits a month. A hundred subscribers all maxing out
is 90,000 credits a month — check what the plan actually includes before
promoting to that many people.

## A free account spends nothing

Every endpoint that costs money checks `callerIsPro` before spending
anything: `ai-assistant` (Anthropic), `product-search` and
`market-research` (Tavily). A free account gets a 402 and neither a token
nor a credit is spent making it.

That is load-bearing for the unit economics. Free users are meant to cost
fractions of a cent, so the business scales on subscribers rather than on
signups. Any new endpoint that calls a paid API must do the same check, in
the same place: before the work, not after.

`market-research` was the exception and did not, which is exactly why this
section exists. It was deployed but never committed, so it was invisible
to review — any signed-in free account could call it directly and spend
Tavily credits with no limit at all. It now shares product-search's
allowance, because both spend the same budget and two separate counters
would let one account exhaust one and carry on through the other.

## There is no demo mode

Sign-in used to fall back to a fake session when the network failed. It was
a development convenience and a data-loss bug: the session had no account
id, so everything the person entered was stored under a key their real
account would never read. `tests/nodemo.mjs` exists to keep it gone.
