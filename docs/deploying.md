# How this gets deployed

## Branches

- **`main`** — what customers see. Vercel builds this and serves it at
  reamp.store.
- **`claude/...`** — where work happens. Pushing to one of these does not
  touch the live site.

Nothing reaches customers until something is merged into `main`.

Until 18 Sep 2026 there was no `main` at all: the repo's default branch was
`claude/new-session-pgouzq`, Vercel built that, and so every commit pushed
during development went live within a minute or two, with no earlier version
to fall back to. That is the problem this layout fixes.

## Shipping a change

1. Work lands on a `claude/...` branch and is pushed there.
2. On GitHub, open a pull request from that branch into `main`.
3. Merge it.
4. Vercel sees `main` change and deploys, usually inside a minute.

## Rolling back

Vercel → the `app` project → **Deployments** → find the last good one →
**⋯** → **Promote to Production**.

Takes seconds, and it is the reason `main` is worth having: there is always
a known-good deployment sitting there to go back to.

## Settings that live outside this repo

These cannot be changed from here and have to be done in a dashboard:

| Where | What |
|---|---|
| GitHub → Settings → General | default branch (`main`) |
| Vercel → project → Settings → **Environments** → **Production** → Branch Tracking | which branch deploys to production |
| Supabase → Authentication → URL Configuration | Site URL, redirect URLs |
| Supabase → Authentication → Emails → Templates | the reset email, kept in `supabase/templates/` |
| Supabase → Edge Functions → Secrets | `TAVILY_API_KEY`, `ANTHROPIC_API_KEY` |

### Finding the production branch setting

It is not on the Git page, which is the obvious place and where everyone
looks first. It is under **Settings → Environments**, which shows a *list*
of environments — you have to click into **Production** — and then it is
called **Branch Tracking**, not "Production Branch".

It is set explicitly on this project, so it does not follow the repo's
default branch. Changing the default on GitHub alone does nothing here.

## Where a user's data lives

In Postgres, one row per user, behind Row Level Security — `inventory`,
`sales`, `watchlist`, and the profile row that also carries settings.

The browser keeps a copy, but only as a cache: it fills the screen
instantly, survives a dead connection, and is written before the network
call so a change is never lost if the tab closes mid-save. The server is
the source of truth.

It used to be the other way round — local storage was the only copy — which
meant data did not survive closing a tab, did not follow anyone to a second
device, and was invisible between `reamp.store` and `www.reamp.store`
because those are separate origins with separate storage.

## Edge Functions deploy separately

They do **not** ship with the site. A push to `main` updates the front end
only. Functions go out with:

```bash
supabase functions deploy product-search
```

This has bitten us: `product-search` sat five versions behind for weeks
while the front end had long since moved on, and the symptom was a feature
that simply looked broken.
