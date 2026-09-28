import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* ═══════════════════════════════════════════════════════════════
   auth-callback — the page Google redirects back to.

   Why this exists: OAuth needs a REAL url to return to. An app running
   inside a preview frame has no such url. This function is a real page on
   your own supabase.co domain, so it can be registered as a redirect
   target. It hands the token back to whichever window opened it, then
   closes itself.

   verify_jwt is OFF here, and that is correct: this is a browser landing
   page reached mid-sign-in, so no JWT exists yet. It holds no secrets and
   only relays a token the browser already received.

   ── This file was deployed for months without being in the repository ──

   Which is how the bug below survived. It was found by diffing what is
   deployed against what is committed, not by reading code, because there
   was no committed code to read. `market-research` had the same story.
   Anything deployed belongs here.
   ═══════════════════════════════════════════════════════════════ */

/* Where a session may be delivered.

   The version of this file that was live called
   postMessage(payload, '*'), with a comment noting it should be narrowed
   before production. It never was. '*' means the browser hands the
   access AND refresh token to whatever window opened this page — so any
   site could open the Google authorize URL as a popup, let the redirect
   land here, and be handed a working session for whoever was signed in.
   That is account takeover, and the victim only has to visit the page.

   The app's Google button is currently off (GOOGLE_SIGN_IN = false in
   App.jsx), which is the only reason this was dormant rather than live.
   "Unreachable from our own UI" is not a security boundary — this URL is
   public and reachable by anyone.

   An opener's origin cannot be read cross-origin, so there is nothing to
   compare against. The fix is the other direction: post once per allowed
   origin. A window on any other origin is passed nothing at all. */
const ALLOWED_ORIGINS = [
  "https://www.reamp.store",
  "https://reamp.store",
];

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Signing you in…</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#0B0708; color:#F5EFEE;
         font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; }
  .box { text-align:center; padding:28px 32px; }
  .dot { width:9px; height:9px; border-radius:99px; background:#E5142B;
         display:inline-block; margin:0 3px; animation:p 1.1s infinite; }
  .dot:nth-child(2){animation-delay:.18s} .dot:nth-child(3){animation-delay:.36s}
  @keyframes p { 0%,100%{opacity:1} 50%{opacity:.35} }
  h1 { font-size:17px; font-weight:700; margin:18px 0 6px; }
  p  { font-size:13px; color:#A08F8F; margin:0; line-height:1.55; max-width:320px; }
</style></head>
<body><div class="box">
  <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  <h1 id="t">Signing you in…</h1>
  <p id="m">You can close this window in a moment.</p>
</div>
<script>
(function () {
  var ALLOWED = ${JSON.stringify(ALLOWED_ORIGINS)};

  var p = new URLSearchParams((location.hash || '').slice(1));
  var q = new URLSearchParams(location.search);
  var token = p.get('access_token');
  var refresh = p.get('refresh_token');
  var err = p.get('error_description') || q.get('error_description') || q.get('error');

  var payload = { type: 'supabase-auth', access_token: token, refresh_token: refresh, error: err };

  /* Hand the result back to the window that opened us — but only if that
     window is on one of our own origins. postMessage with an explicit
     target origin is dropped silently by the browser when it does not
     match, so a popup opened by anybody else is handed nothing. */
  try {
    if (window.opener) {
      for (var i = 0; i < ALLOWED.length; i++) {
        window.opener.postMessage(payload, ALLOWED[i]);
      }
      setTimeout(function () { window.close(); }, 400);
      return;
    }
  } catch (e) {}

  // No opener (full-page redirect, or the frame severed the link):
  // show the outcome plainly instead of a dead loading screen.
  var t = document.getElementById('t'), m = document.getElementById('m');
  document.querySelectorAll('.dot').forEach(function (d) { d.style.display = 'none'; });
  if (err) {
    t.textContent = 'Sign-in failed';
    m.textContent = err;
  } else if (token) {
    t.textContent = 'Signed in';
    m.textContent = 'This window was not opened by the app, so it cannot hand the session back automatically. Close this tab and return to the app.';
  } else {
    t.textContent = 'Nothing to do';
    m.textContent = 'No sign-in information was returned.';
  }
})();
</script>
</body></html>`;

Deno.serve(() =>
  new Response(PAGE, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      /* This page carries a session in its URL fragment. Keep it out of
         caches and out of referrers. */
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    },
  })
);
