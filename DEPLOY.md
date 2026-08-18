# Deploying

The app is a static Vite bundle. There is no server to run — the backend is
Supabase (Postgres, Auth, Edge Functions), which is already deployed and is
not affected by where the frontend is hosted.

`vercel.json` and `netlify.toml` are both in the repo, so either host builds
this correctly with no settings to fill in. Pick one.

Both free tiers serve **private** repositories. GitHub Pages does not, on a
free plan, which is why it isn't the recommendation here.

## Vercel

1. https://vercel.com/signup — **Continue with GitHub**
2. **Add New → Project**, then **Import** `Imahackerforgames/App`
3. Leave every field as detected (`vercel.json` supplies build command,
   output directory and the SPA rewrite) and press **Deploy**
4. Roughly a minute later you have `https://<name>.vercel.app`

Every push to the default branch redeploys automatically.

## Netlify

1. https://app.netlify.com/signup — **GitHub**
2. **Add new site → Import an existing project → GitHub →** `App`
3. Leave the defaults (`netlify.toml` supplies them) and **Deploy**

## After the first deploy

Two things need the live URL, and neither is optional if you want sign-in
and live search to work.

### 1. Supabase auth URLs

Dashboard → **Authentication → URL Configuration**

- **Site URL**: the deployed origin, e.g. `https://your-app.vercel.app`
- **Redirect URLs**: add the same origin

Email confirmation links and Google sign-in both redirect through here. Until
the origin is listed, they bounce.

### 2. Edge Function secrets

Dashboard → **Edge Functions → Secrets**

| Secret | Turns on |
|---|---|
| `TAVILY_API_KEY` | Product Search and market research — live marketplace listings |
| `ANTHROPIC_API_KEY` | The AI assistant, AI Discover, and Claude's web search fallback |

Secrets are read on the next invocation. No redeploy needed.

These are server-side only. They are never bundled into the frontend, never
committed, and never returned by an API. Anything prefixed `VITE_` **is**
bundled into the browser, so neither key may ever be named that way.

## Why the preview links can't do this

The artifact preview links are sandboxed pages that block all outbound
network requests. Sign-in falls through to demo mode and no Edge Function is
ever called — the project logs show zero invocations. That is a property of
the sandbox, not a configuration problem, and no API key changes it. A real
deployment is the fix.

## Checking it worked

Sign up with a real email, confirm it, then **Discover → Product Search** and
search for something. Live results are real listing pages from eBay, Mercari,
Vinted, Poshmark and Depop. If you instead see "Live web search is
unavailable", the call reached the app but not Tavily — the function returns
a specific reason, visible in the Supabase function logs.
