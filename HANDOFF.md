# Reseller OS — Handoff to Claude Code

Read this first. It records what is **already built and verified**, so
Claude Code doesn't rebuild it and hit "already exists" errors on step one.

---

## Supabase project

| | |
|---|---|
| Project ref | `ggfqqybjcljtqezyuxyx` |
| URL | `https://ggfqqybjcljtqezyuxyx.supabase.co` |
| Region | us-west-2 · Postgres 17.6 |
| Publishable key | `sb_publishable_QMiKmcOp-0WkYaYu9k0fpw_uXMqE9BC` |

The publishable key is safe in frontend code — it only grants what RLS
allows. The **service role key** must never appear in frontend code, in
git, or in a chat window.

---

## ALREADY BUILT — do not recreate

### Tables (RLS enabled, isolation tested both directions)

**`profiles`** — `id` (FK to auth.users, cascade), name, state, zip,
radius (default 25), theme (default 'heat'), onboarded, created_at.
A trigger `on_auth_user_created` inserts a row automatically on signup,
pulling the name from Google metadata when present.

**`watchlist`** — id, user_id (FK, cascade), title, category, notes,
created_at. Unique on (user_id, title). Indexed on (user_id, created_at desc).

Both tested with two real users: each sees only their own rows, and a
write aimed at another user's row is rejected. Four policies on watchlist
(select/insert/update/delete), three on profiles (no delete — that
cascades from auth.users).

### Edge Functions (all ACTIVE)

| Function | JWT | Purpose |
|---|---|---|
| `product-search` | required | Tavily search restricted to the 7 resale marketplaces |
| `market-research` | required | Tavily research for the chatbot, returns sources + staleness |
| `auth-callback` | **off** | OAuth landing page; posts token back to the opener |

`auth-callback` has verify_jwt off deliberately — it's a browser landing
page reached mid-sign-in, before any JWT exists. It holds no secrets.

`TAVILY_API_KEY` is set as a Supabase secret.

### Auth status

- **Email + password: working.** Uses the REST endpoints directly.
- **Google: configured, not completing.** Logs show
  `Redirecting to external provider — google` succeeding, but zero users
  in `auth.users`. Google accepts the handoff and never returns.

**Outstanding fix:** in Google Cloud Console → Credentials → OAuth client →
Authorized redirect URIs, confirm it is exactly
`https://ggfqqybjcljtqezyuxyx.supabase.co/auth/v1/callback`
(ends `/auth/v1/callback`, NOT `/functions/v1/auth-callback`).
Also check OAuth consent screen → Test users includes your own Gmail, or
Google blocks sign-in while the app is in Testing mode.

Separately, Supabase → Authentication → URL Configuration → Redirect URLs
must list `https://ggfqqybjcljtqezyuxyx.supabase.co/functions/v1/auth-callback`.

---

## The prototype file

`reselling-app-v3.jsx` — single file, ~2,600 lines. It is a **design and
behaviour reference**, not a codebase to import wholesale.

**Worth lifting:**
- `AuthScreen` — the login UI, drifting icons, popup OAuth + postMessage
- `verdict()` — VERY GOOD / VERY BAD / NOT ENOUGH DATA, one source of truth
- `SearchProvider` — five methods; swap the insides, UI never changes
- `needsWebSearch()` — routes personal questions to the DB, not the web
- `safeUrl()` + `stripPrices()` — domain allowlist and price scrubbing
- `THEMES` — 5 palettes as CSS variables, no component knows a colour
- Meetup vs Shipping sale split; Available vs Sold Out stock

**Do not lift:**
- `useStore()` — uses `window.storage`, an artifact-only API. Replace with
  Supabase queries entirely.
- `CATALOG` — labelled reference data, not real market data.
- Any browser-side `askClaude()` call — move to an Edge Function so the
  API key isn't exposed.

---

## Rules carried over from the specs

1. **Never display a purchase price the user didn't enter.** No product
   record has a `buy` field; this is enforced structurally, not by prompt.
2. **No gamification.** No XP, levels, challenges, badges, streaks.
3. **Product Search covers only** eBay, Mercari, Vinted, Poshmark,
   Facebook Marketplace, Depop, OfferUp. Amazon appears only as a shop
   link in Reseller Essentials.
4. **Label data honestly** — verified (their records) / observed (found
   online) / estimated (calculated) / predicted (inference). Never
   guarantee income.
5. Categories: Shoes, Clothes, Jewelry, Accessories, Headwear, Colognes,
   Other. Plus Low/High Ticket.

---

## Still to build

Frontend only. The backend is done.

1. Install `@supabase/supabase-js`, create the client, wire real sessions
2. Replace `window.storage` with Supabase reads/writes throughout
3. Protected routes — signed-out users go to the landing page
4. Move the Anthropic/Groq calls server-side into an Edge Function
5. Inventory, sales, goals tables (schema pattern: copy `watchlist`)
6. Then: notifications, suppliers, video guides, billing

---

## First prompt

> Read this whole project. Do not edit anything yet. Report back: existing
> stack, routes, folder structure, and where API keys currently live. Flag
> anything that looks like a secret exposed to the frontend.
>
> My Supabase project already has: `profiles` and `watchlist` tables with
> RLS, a signup trigger, and three Edge Functions (`product-search`,
> `market-research`, `auth-callback`). Do not recreate any of them.

Check that report matches your actual repo before handing over any more.
If it describes files that don't exist, stop — it isn't reading your code.
