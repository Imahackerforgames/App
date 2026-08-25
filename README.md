# Reselling App

A real project, not a chat artifact. Everything here runs on your machine.

---

## Get it running (about 5 minutes)

You need **Node.js 18 or newer** first. If `node --version` errors, install
it from nodejs.org (take the LTS version), then reopen your terminal.

```bash
npm install
cp .env.example .env
npm run dev
```

That opens the app at `http://localhost:5173`.

`npm install` takes a minute the first time. After that, `npm run dev` is
instant and reloads as you edit.

---

## What's already built

Your Supabase backend is live and tested. **Don't rebuild any of it.**

- `profiles` and `watchlist` tables, both with Row Level Security,
  verified so one user cannot read or write another's rows
- A trigger that creates a profile automatically on signup
- Three Edge Functions: `product-search`, `market-research`, `auth-callback`
- `TAVILY_API_KEY` set as a Supabase secret

Details in `HANDOFF.md`. Read that before letting any AI tool touch the
database.

---

## What still needs doing

Frontend work only.

1. **Install the Supabase client** — `npm install @supabase/supabase-js`,
   create `src/lib/supabaseClient.js`
2. **Replace `window.storage`** — see the shim in `src/main.jsx`. It's
   localStorage scaffolding so the app runs today. Every call needs to
   become a Supabase query so data follows the user across devices.
3. **Split `App.jsx`** — it's ~2,600 lines in one file. Break it into
   components under `src/components/`.
4. **Move AI calls server-side** — `App.jsx` calls the Anthropic API from
   the browser. That exposes the key. Move it into an Edge Function.
5. Then: inventory/sales tables, notifications, suppliers, billing.

---

## Known issue

Google sign-in reaches Google but no account comes back. Supabase logs
show the handoff succeeding, so the problem is in Google Cloud Console.

Check that **Authorized redirect URIs** (not Authorized JavaScript
origins — different box, same page) contains exactly:

```
https://ggfqqybjcljtqezyuxyx.supabase.co/auth/v1/callback
```

Email and password sign-in already works against real Supabase.

---

## Safety rules carried from the spec

- **Never show a purchase price the user didn't enter.** No product record
  has a `buy` field — this is enforced structurally, not by prompt.
- **No gamification.** No XP, levels, challenges, badges, streaks.
- Product search covers only eBay, Mercari, Vinted, Poshmark, Facebook
  Marketplace, Depop, OfferUp.
- Label data honestly: verified / observed / estimated / predicted.
  Never guarantee income.

---

## First thing to ask Claude Code

> Read HANDOFF.md, then read the whole project. Don't edit anything yet.
> Report back: what exists, what's missing, and anything that looks like
> a secret exposed to the frontend.

If its report describes files that aren't here, stop — it isn't reading
your actual code.

---

## Working on this as a team

**The live app:** https://app-resell6.vercel.app — public, no access needed.
Anyone can open it and make their own account. Accounts don't see each
other's data.

**To change the code**, you need to be a collaborator on this repository.
Then:

```bash
git clone https://github.com/Imahackerforgames/App.git
cd App
npm install
npm run dev
```

Pushing to the default branch deploys to the live URL automatically, in
about a minute. That is worth knowing before you push: there is no staging
step. For anything non-trivial, branch and open a pull request:

```bash
git checkout -b your-change
# ...work...
git push -u origin your-change
```

**What you do not need access to.** Vercel and Supabase are only for whoever
administers deployments and the database. Contributing code needs neither —
push to GitHub and the deploy happens on its own.

### Keys and secrets

`src/App.jsx` contains the Supabase URL and its publishable key. Those are
meant to be public; the publishable key only grants what row-level security
allows, and every table is scoped to its owner.

Three keys are **not** in this repository and must never be added to it:

| Key | Lives in |
|---|---|
| `TAVILY_API_KEY` | Supabase → Edge Functions → Secrets |
| `ANTHROPIC_API_KEY` | Supabase → Edge Functions → Secrets |
| Supabase service role key | Supabase only, never anywhere else |

Anything prefixed `VITE_` is compiled into the browser bundle and readable by
anyone using the app, so no secret may ever be named that way.

### Where things live

- `src/App.jsx` — the whole frontend
- `src/components/AIAssistant.jsx` — the assistant panel
- `supabase/functions/` — the backend, deployed separately to Supabase
- `DEPLOY.md` — hosting and the two post-deploy settings
- `CLAUDE.md` — how the AI integration is wired, and its constraints
