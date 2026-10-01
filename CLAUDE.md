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

A real payment has now been seen, so the paid path reads one confirmed
spelling each: `type` and `data` at the top level, `data.api_metadata.data.user_id`
for the account, `data.subscription.id` for the subscription. Two findings
from that payload are worth not re-deriving — **`buyer.id` came back null**,
so `commas_customer_id` is usually empty and the subscription id is the only
reliable key, and **`data` has no `id` of its own**, only `payment_id`, with
the envelope carrying its own id.

That second one is why nothing here may fall back to a bare `id` for the
subscription. Such a fallback can only ever store a payment-shaped
identifier, and the guard that asks whether a cancellation concerns the
subscription an account is actually on would then compare a real
subscription id against a payment id, decide the event belongs elsewhere,
and leave a cancelled account on `pro` while the card stopped being charged.
`tests/commashook.mjs` fails if the fallback returns.

Cancellation and renewal events have still never been seen, so those reads
deliberately still try several spellings. That is not leftover guesswork
left lying around; it is the only honest thing to do about an event nobody
has observed. Collapse them when one arrives.

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
| Product searches | 40 per **3 hours** **and 75/month** | account |
| Market research | shares the search buckets | account |
| Assistant questions | 40 per **3 hours** **and 50/month** | account |

The short window is three hours, not one. That is a bigger single sitting
and a **lower** sustained rate than an hourly cap: an hourly 25 allowed 75
searches in any three hours, where 40 per three hours allows 40. Somebody
researching properly does twenty searches in an evening and then stops, and
an hourly cut-off interrupted that while still permitting far more per day.

**One press is not one unit, and this is the thing to say out loud when
quoting the numbers.** An analysis is two calls to `product-search`, so 40
searches is twenty analyses. And four features draw on the assistant
allowance — the chat, product descriptions, the listing generator and AI
Discover — so a subscriber can spend questions without ever opening the
chat. Settings says both of these under the meters, because a counter that
moves for invisible reasons is a counter nobody believes.

`product-search` and `market-research` share one counter row, so both must
declare the same `SEARCH_MAX` and `SEARCH_WINDOW`. A mismatch would make
the reset time depend on which endpoint was called last.

Both search and assistant answer a `{ peek: true }` request with the
balance without spending any of it. Settings → **Usage** reads them that
way and shows a meter, what has been used in the last 3 hours, the reset
time, and the monthly balance. It is premium-only, because a free account
has no allowance to report.

All six numbers are settable from Edge Function secrets without a deploy —
`SEARCH_MAX`, `SEARCH_WINDOW_SECONDS`, `SEARCH_MONTH_MAX`, `ASK_MAX`,
`ASK_WINDOW_SECONDS`, `ASK_MONTH_MAX` — each clamped to 10x its default so
a stray zero in a dashboard is not a policy change nobody reviewed.

**One of those overrides is currently load-bearing, and must not be removed
casually.** `SEARCH_MONTH_MAX=75` has to be set as an Edge Function secret,
because the deployed `product-search` still carries the old default of 40
while this repo and the deployed `market-research` say 75. They share one
counter row, so without the secret the two endpoints disagree about the same
allowance and a subscriber refused by `product-search` at 40 could keep
spending through `market-research` up to 75.

It is a secret rather than a redeploy on purpose. `product-search` is 38KB
with 29 regex literals and no local toolchain here could deploy it from
disk — only by pasting the source into an API call, which is exactly the
risk the file's own header tells you not to take to change a number. The
override is the mechanism that exists so you don't have to.

Remove the secret the next time `product-search` is deployed properly
(`supabase functions deploy product-search` from a machine with the CLI and
an access token). At that point the code default of 75 takes over and the
secret becomes a trap: a value in a dashboard silently overriding the number
a future reader sees in the source.

Two windows, because one cannot do the other's job. The short limit stops
a burst; it says nothing about sustained use. Forty questions every three
hours, around the clock, is legal under it and comes to 9,000 questions a
month from one account paying $25 — and even a human asking steadily
through a working day costs more than they pay. The monthly cap is what
makes a single account unable to cost more than it brings in.

**The month is the real allowance, and both are now close to the window.**
Search is 40 a window against 75 a month — just under two full sittings.
Questions are 40 against 50, barely more than one. Raising a window without
raising its month only changes *when* a subscriber hits the wall, not how
much they get, so the monthly pair is what to move if subscribers complain.

**The assistant cap is now sized from measured cost.** One question on
`claude-opus-5` is roughly 2–4k input tokens at $5/MTok plus whatever of the
16000 `max_tokens` the answer and its thinking consume at $25/MTok — about
three to ten cents typically, forty-two at the cap. Fifty questions is
therefore $1.50–5 normally and $21 worst case, against $25 of revenue, which
satisfies the rule the number exists for: **a subscriber who maxes out must
still cost less than they pay.** 250 did not satisfy it — $12–25 typically
and over $100 at the cap.

What 50 costs in generosity is real. It is about one and a half
window-fulls, and four features draw on the allowance rather than just the
chat, so twenty product descriptions and a few listings is most of a
subscriber's month. Move this number if subscribers complain — but move it
with a measured cost per question in hand.

Token cost is not the whole bill: web search is enabled (`max_uses` 5) and
Anthropic charges per search on top of tokens, so a question that searches
costs more than the arithmetic above. Confirm that rate before treating the
$21 worst case as the ceiling.

The search number is low because one call is not one Tavily credit. It
fans out to a search per marketplace plus a page extract, so a call costs
five or six credits and an analysis costs around a dozen. Forty per three
hours is about 240 credits per window for one account.

**At 75 the monthly search cap no longer fits the budget for 50
subscribers, and that is a deliberate trade.** Tavily's $100 plan is 15,000
credits and a call costs five or six, so the plan covers
`15,000 / (75 × 6) = 33` subscribers at this cap. Forty was the number that
fit fifty (50 × 40 × 6 = 12,000, with 3,000 in reserve), but 40 a month
against a 40 window meant one sitting spent the whole month — a worse thing
to ship than a budget that needs watching.

So the cap is **no longer self-enforcing against the bill**, and two things
have to be true in its place: a spend cap set at Tavily itself, which no bug
in this code can bypass, and somebody watching the credit balance through
the first month. Past roughly 33 paying subscribers the plan runs dry and
search stops for everyone — including subscribers nowhere near their own cap.

Recompute it when any input moves. The formula is `subscribers × cap ×
credits-per-call ≤ plan credits`, and the input most likely to be wrong is
credits-per-call — check it against a real Tavily bill after month one.
Realistically the worst case does not happen: 50 subscribers averaging
fifteen calls a month spend about 4,500 credits, under a third of the plan.
But "realistically" is load-bearing in that sentence now, where at 40 it was
not.

The only hard ceiling on the bill is a spend cap set with Anthropic and
Tavily themselves, which no bug in this code can bypass.

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
