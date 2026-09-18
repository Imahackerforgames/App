# Password reset tests

Playwright, run against a production build with Supabase mocked. Three files:

| File | What it covers |
|---|---|
| `reset.mjs` | Every route and edge: the link, the code, expired links, a stored session not hijacking a reset, the link pasted into an open tab, and ordinary sign-in still working. |
| `premium.mjs` | What a free account can and cannot reach, and that a premium account reaches all of it. Walks every tab on both plans. |
| `checkout.mjs` | That all four "Upgrade to premium" buttons open the current checkout link and not a stale one. |
| `brand.mjs` | The name and the mark: the tab title, the wordmark on every tab, the favicon resolving, and no trace of the old name left. |
| `zoomcheck.mjs` | That no field is small enough to make iOS zoom on tap, that no page scrolls sideways at 320px or 390px, and that desktop sizing is untouched. |
| `zoomaudit.mjs` | Prints every form control and its size on a phone viewport — the diagnostic behind zoomcheck, for when a new one is added. |
| `fnsearch.mjs` | The product-search Edge Function itself, run in Node with Tavily stubbed: one search per marketplace, results dealt out evenly, filters still narrowing, one board failing not sinking the rest. |
| `entcheck.mjs` | What "I've paid — check again" reports back: premium found, genuinely free, expired session, blocked table, lapsed premium, no network. |
| `signinout.mjs` | Signing in with the address typed in any case, the password being left untouched, a wrong password still failing, and signing out revoking the session server-side before signing straight back in. |
| `soldcard.mjs` | Recent sold activity for a live-searched product: counted totals, the per-marketplace breakdown, the cap marked as a floor, no time claim, and an honest empty state when nothing was found. |
| `themes.mjs` | Each of the four palettes applying its variables, all four being offered in Settings, and none of the old theme names surviving anywhere. |
| `errs.mjs` | Every Supabase error shape, using the real response bodies — broken SMTP, rate limiting, a reused password, a breached password, a dead session, reauthentication. |

## Running them

```bash
npm install
npm run build
npx vite preview --port 4173 --strictPort &   # tests expect this port
node tests/reset.mjs
node tests/errs.mjs
node tests/premium.mjs
node tests/checkout.mjs
node tests/brand.mjs
node tests/zoomcheck.mjs
node tests/themes.mjs
node tests/soldcard.mjs
node tests/signinout.mjs
node tests/entcheck.mjs
node tests/savedsat.mjs
node tests/fnsearch.mjs   # no browser or network needed
```

Playwright is not in package.json — it is a development tool, not something
the app ships. Install it where you run the tests:

```bash
npm install --no-save playwright
```

## Screenshots

Some of these write `shot-*.png` next to the repo root so a change to the
look can be eyeballed rather than only asserted. They are output, not
source, and are ignored by git.

## What they cannot tell you

Supabase is mocked, so these prove the app's half: that it sends the right
requests, reads the answers correctly, and puts the right screen in front of
the user. They say nothing about whether your Supabase project can actually
deliver email — that is configuration, and it fails in the dashboard rather
than in this code.
