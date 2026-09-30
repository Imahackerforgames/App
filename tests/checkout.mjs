/* Where "Upgrade to premium" actually sends people.

   Four buttons open checkout and they must not drift apart, which is why
   openCheckout is one function and why this checks all four.

   There is no link to paste any more. Commas mints a checkout page through
   its API, so there is a round trip before there is anywhere to go, and
   then this tab is redirected to it.

   It used to open a tab up front and point it at the link on arrival, to
   dodge Safari's popup blocking. That shipped and was reported as landing
   on a blank screen, because `window.open(..., "noopener")` returns
   **null** by specification: the tab opened, nothing held a handle to it,
   and the code fell through to redirecting this tab — leaving an
   about:blank in front of a checkout page loading behind it.

   So the popup assertion inverted. It is no longer "a tab is opened
   synchronously" but "no tab is opened at all", checked through
   Playwright's own popup event rather than a stub, because a stubbed
   window.open is exactly what hid the bug: the stub returned a usable
   object where the real browser returns null.

   The account id is not in the URL either. The Edge Function reads it from
   the token it verifies, so the assertion is that no URL the browser builds
   carries it — stronger than the old "the link carries the id", because an
   id in a query string is an id the customer can edit. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

await page.route("**://*.supabase.co/**", (r) => r.abort());
await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

/* The link now comes from the server. Stubbed so the test never touches
   Commas, and so the returned URL is distinctive enough to recognise. */
const PAY_LINK = "https://www.fanbasis.com/pay/session-xyz";
await page.route(/\/functions\/v1\/commas-checkout/, (r) => r.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({ url: PAY_LINK }),
}));

const UID = "u1";
await page.addInitScript((uid) => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email",
    token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "tester", onboarded: true,
    theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  /* window.open is deliberately NOT stubbed. A stub that returns a usable
     tab object is what let the about:blank bug through — the real browser
     returns null for a noopener open, and the stub did not. Popups are
     observed through Playwright instead, which sees what actually happens.

     alert still is, because a real one blocks the run. */
  window.__alerts = [];
  window.alert = (m) => { window.__alerts.push(String(m)); };
}, UID);

/* Any tab the app opens, as the browser reports it. Zero is the assertion.  */
const popups = [];
ctx.on("page", (p) => popups.push(p.url()));

/* Every request the browser makes for the payment page, fulfilled with a
   stub so nothing leaves for Commas and the redirect completes observably. */
const navs = [];
page.on("request", (r) => { if (r.url().startsWith(PAY_LINK)) navs.push(r.url()); });
await page.route(PAY_LINK, (r) => r.fulfill({
  status: 200, contentType: "text/html", body: "<title>Commas</title>checkout stub",
}));

const APP = "http://localhost:4173/";
await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

/* Each entry point starts from a fresh load. It has to: a successful
   checkout navigates away and leaves checkoutBusy set, deliberately, so
   without a reload the second button in this list would correctly refuse to
   do anything and the test would read that as a regression. */
const press = async (steps) => {
  const before = navs.length;
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  await steps();
  await page.getByRole("button", { name: /Upgrade to premium/ }).first().click({ force: true });
  /* A round trip to the checkout function sits between the click and the
     redirect, so this waits longer than a plain click would need. */
  await page.waitForTimeout(1000);
  return { went: navs.slice(before), url: page.url() };
};

const entries = [
  ["AI Discover popup", async () => {
    await page.getByRole("button", { name: /^Discover$/ }).click({ force: true });
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: /AI Discover/ }).click({ force: true });
    await page.waitForTimeout(300);
  }],
  ["Listing popup", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: /^Listing$/ }).click({ force: true });
    await page.waitForTimeout(300);
  }],
  ["assistant popup", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator("button").filter({ hasText: "" }).last().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }],
  ["Settings button", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
    await page.waitForTimeout(500);
  }],
];

let fired = 0;
for (const [label, steps] of entries) {
  const { went, url } = await press(steps).catch(() => ({ went: [], url: "" }));

  if (went.length) {
    fired++;
    ok(`${label}: redirects to the link the server minted`, went.at(-1) === PAY_LINK, JSON.stringify(went));
    /* This tab, not a new one. The whole reported bug was a second tab. */
    ok(`${label}: lands on it in this tab`, url === PAY_LINK, url);
    ok(`${label}: asked for it exactly once`, went.length === 1, JSON.stringify(went));
  } else {
    ok(`${label}: went to checkout`, false, `stayed on ${url}`);
  }
}
ok("all four entry points respond", fired === 4, String(fired));

/* The reported bug, as an assertion. Nothing may open a tab — not a
   holding page, not a popup, nothing. A stray about:blank stealing focus
   reads to a customer as the payment being broken, and it is worse than
   that: they cannot see the page that did load behind it. */
ok("no tab was opened at any point", popups.length === 0, JSON.stringify(popups));

/* The id is the server's business now. It used to ride in the query string,
   where the customer could edit it and pay as somebody else; the function
   reads it from the token it verifies instead. Nothing the browser builds
   should mention it. */
ok("no URL the browser builds carries the account id",
   !navs.some((u) => u.includes(UID)), JSON.stringify(navs));

/* ── one tap, one session ───────────────────────────────────────────────
   Four buttons, no shared React state between them, and a round trip
   between the click and leaving the page. Without a guard an impatient
   double tap mints two checkout sessions, and somebody who completes both
   is charged twice for one subscription. */
{
  console.log("\n-- tapped twice in a hurry --");
  const fnCalls = [];
  page.on("request", (r) => { if (/commas-checkout/.test(r.url())) fnCalls.push(r.url()); });

  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
  await page.waitForTimeout(500);
  const before = fnCalls.length;
  const btn = page.getByRole("button", { name: /Upgrade to premium/ }).first();
  await btn.click({ force: true });
  await btn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  ok("two taps mint one checkout session, not two",
     fnCalls.length - before === 1, `${fnCalls.length - before} calls`);
}

/* Signed out, checkout must refuse. Taking money that cannot be matched to
   an account is worse than not taking it. Back to the app's own origin
   first — after a redirect this page is on the payment host, where the
   app's localStorage does not exist. */
await page.goto(APP, { waitUntil: "networkidle" });
await page.evaluate(() => { localStorage.removeItem("ros:session"); });
const navsBefore = navs.length;
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
ok("signed out, no checkout was started on load", navs.length === navsBefore, JSON.stringify(navs.slice(navsBefore)));
ok("and still no tab was ever opened", popups.length === 0, JSON.stringify(popups));

const body = await page.locator("body").innerText();
ok("no retired payment provider named anywhere", !/stripe/i.test(body), body.match(/.{0,40}stripe.{0,20}/i)?.[0]);

/* ── Somebody who already pays must not be able to buy it twice ─────────
   Two subscriptions on one account is one person charged twice for one
   thing: a refund, an apology, and quite possibly a chargeback.

   Every upgrade button is already hidden from a premium account, which is
   the real protection and is asserted first. The guard inside openCheckout
   is the backstop for the cases hiding does not cover — a screen drawn
   before the plan finished loading, a stale tab, a route nobody thought
   of. Hiding a control is a drawing decision; this is the one that spends
   money, so it is checked where the spending happens. */
{
  console.log("\n-- with premium already on the account --");
  const proCtx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const pro = await proCtx.newPage();
  pro.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  await pro.route("**://*.supabase.co/**", (r) => r.abort());
  await pro.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  /* Registered after the catch-all so it matches first — Playwright tries
     routes in reverse registration order, and a catch-all registered later
     swallows everything behind it. */
  await pro.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ plan: "pro", expires_at: null }]),
  }));

  await pro.addInitScript((uid) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "tester", onboarded: true,
      name: "Tester", state: "Georgia", zip: "30106", theme: "obsidian" }));
    window.__opened = []; window.__alerts = [];
    window.open = (u) => { window.__opened.push(String(u)); return { closed: false }; };
    window.alert = (m) => { window.__alerts.push(String(m)); };
  }, UID);

  await pro.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await pro.waitForTimeout(1500);

  const upgrades = await pro.getByRole("button", { name: /upgrade to premium/i }).count();
  ok("no upgrade button is offered at all", upgrades === 0, String(upgrades));

  const st = await pro.evaluate(() => ({ opened: window.__opened, alerts: window.__alerts }));
  ok("and no checkout was opened", st.opened.length === 0, JSON.stringify(st.opened));

  await proCtx.close();
}

/* The backstop itself, read as source. It cannot be reached through the UI
   precisely because the buttons are hidden, so clicking is not a way to
   test it — and "unreachable today" is exactly the condition under which a
   guard quietly stops working. */
{
  console.log("\n-- the guard inside openCheckout --");
  const { readFileSync } = await import("fs");
  const src = readFileSync("/home/user/App/src/App.jsx", "utf8");
  const fn = (src.split(/function openCheckout\s*\(/)[1] || "").split(/\n}/)[0];

  ok("openCheckout refuses when the account is already premium",
     /if\s*\(\s*checkoutIsPro\s*\)/.test(fn), fn.slice(0, 200));
  ok("it says so rather than failing silently", /alert\(/.test(fn));
  ok("the refusal comes before anything is spent",
     fn.indexOf("checkoutIsPro") < fn.indexOf("startCommasCheckout"),
     "a check after the session is minted is not a check");
  /* The other half of not charging twice: not two sessions from one
     screen. Read as source because the race is hard to hit on demand. */
  ok("a checkout already under way blocks a second one",
     /if\s*\(\s*checkoutBusy\s*\)\s*return/.test(fn), fn.slice(0, 400));
  ok("and the flag is not cleared on the way out",
     fn.indexOf("window.location.href = url") < fn.indexOf("checkoutBusy = false"),
     "clearing it before navigating lets an impatient second tap through");
  ok("checkoutIsPro tracks the plan the server reported",
     /useEffect\(\(\)\s*=>\s*\{\s*checkoutIsPro\s*=\s*isPro;?\s*\}/.test(src));
  ok("and is cleared on sign-out", /if\s*\(!user\)\s*checkoutIsPro\s*=\s*false/.test(src));
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
