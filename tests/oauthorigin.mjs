/* Where a session is allowed to travel.

   Found by diffing what is deployed against what is committed, during a
   pre-launch sweep. `auth-callback` had been live for months without ever
   being in the repository, and the live copy called

       window.opener.postMessage(payload, '*')

   with its own comment saying to narrow that before production. '*' hands
   the access AND refresh token to whatever window opened the page. Any
   site could open the Google authorize URL as a popup, let the redirect
   land on the callback, and be handed a working session for whoever was
   signed in to Google. The victim only has to visit the page.

   It was dormant rather than live because the app's Google button is off
   (GOOGLE_SIGN_IN = false). That is not a security boundary: the callback
   is a public URL and does not care what our UI offers.

   The matching hole was on the receiving side — the app's message listener
   read ev.data without ever looking at ev.origin, so any page that could
   get a message into the window could present a session to be signed in
   as.

   Both halves are asserted here, as source, because neither can be
   exercised while the feature is switched off. A test that only ran when
   the feature was on would have proved nothing during exactly the period
   the bug existed. */
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const fn  = readFileSync("/home/user/App/supabase/functions/auth-callback/index.ts", "utf8");
const app = readFileSync("/home/user/App/src/App.jsx", "utf8");
/* Both files discuss '*' and the attack at length in comments. Matching the
   raw text would pass on the prose alone. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fnCode  = strip(fn);
const appCode = strip(app);

console.log("\n1. The callback never broadcasts a session to every origin");
{
  /* The literal that caused it. Any postMessage whose target origin is '*'
     is the bug, whatever else the file says. */
  const wildcard = /postMessage\s*\([^)]*,\s*['"]\*['"]\s*\)/.test(fnCode);
  ok("no postMessage(..., '*')", !wildcard,
     "'*' hands the access and refresh token to whatever opened the page");

  ok("posts to an explicit allow-list instead",
     /ALLOWED/.test(fnCode) && /postMessage\s*\(\s*payload\s*,\s*ALLOWED\[/.test(fnCode));

  const origins = (fn.match(/^\s*"https:\/\/[^"]+",?$/gm) || []).join(" ");
  ok("the allow-list is this app's own domain", /reamp\.store/.test(origins), origins);
  ok("and is https only", !/http:\/\//.test(origins), origins);
}

console.log("\n2. The page that carries a token in its URL is not cached or framed");
{
  ok("Cache-Control: no-store", /no-store/.test(fnCode));
  ok("Referrer-Policy: no-referrer", /no-referrer/i.test(fnCode));
  ok("X-Frame-Options: DENY", /X-Frame-Options["\s:]+.*DENY/i.test(fnCode));
}

console.log("\n3. The app checks who sent a session before trusting it");
{
  const handler = (appCode.split(/const onMessage\s*=/)[1] || "").slice(0, 1200);
  ok("onMessage exists", handler.length > 0);
  ok("it reads ev.origin", /ev\.origin/.test(handler),
     "without this, any page that can post into the window can supply a session");
  ok("and returns early when the origin is not ours",
     /includes\(ev\.origin\)\s*\)\s*return|!FROM\.includes/.test(handler), handler.slice(0, 200));
  ok("the check comes before the token is read",
     handler.indexOf("ev.origin") < handler.indexOf("access_token"),
     "an origin check after the fact is not a check");
  ok("our own origin is allowed", /window\.location\.origin/.test(handler));
  ok("so is the Supabase project that serves the callback", /SUPABASE_URL/.test(handler));
}

console.log("\n4. Google sign-in is still off, and the flag still governs it");
{
  ok("GOOGLE_SIGN_IN is false", /const GOOGLE_SIGN_IN\s*=\s*false/.test(appCode),
     "if this is ever turned on, sections 1-3 are what stand between a popup and an account");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
