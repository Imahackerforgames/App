# Password reset tests

Playwright, run against a production build with Supabase mocked. Three files:

| File | What it covers |
|---|---|
| `codeonly.mjs` | The whole journey with the 6-digit code and no link: request, wrong code, real code, reusing the old password, changing it, the old password ceasing to work, the new one signing in, and a used code being refused a second time. |
| `reset.mjs` | Every route and edge: the link, the code, expired links, a stored session not hijacking a reset, the link pasted into an open tab, and ordinary sign-in still working. |
| `errs.mjs` | Every Supabase error shape, using the real response bodies — broken SMTP, rate limiting, a reused password, a breached password, a dead session, reauthentication. |

## Running them

```bash
npm install
npm run build
npx vite preview --port 4173 --strictPort &   # tests expect this port
node tests/codeonly.mjs
node tests/reset.mjs
node tests/errs.mjs
```

Playwright is not in package.json — it is a development tool, not something
the app ships. Install it where you run the tests:

```bash
npm install --no-save playwright
```

## What they cannot tell you

Supabase is mocked, so these prove the app's half: that it sends the right
requests, reads the answers correctly, and puts the right screen in front of
the user. They say nothing about whether your Supabase project can actually
deliver email — that is configuration, and it fails in the dashboard rather
than in this code.
