/* Where "Upgrade to premium" actually sends people.

   Four buttons open checkout and they must not drift apart, which is why
   openCheckout is one function and why this checks all four.

   There is no link to paste any more. Commas mints a checkout page through
   its API, so the browser opens a tab immediately — synchronously, while
   the click is still trusted, because Safari blocks a popup opened after an
   await — and points it at the link once the server returns one.

   That moves the thing this file used to assert. The account id is no
   longer in the URL: the Edge Function reads it from the token it verifies.
   So the assertion flips from "the link carries the id" to "no URL the
   browser builds carries it", which is the stronger property — an id in a
   query string is an id the customer can edit. */
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
  /* Capture rather than navigate, so a real checkout is never opened.
     The stub has to be a usable tab: the Commas path writes a holding page
     into it and then sets location.href, and a bare object would throw
     inside the click handler instead of failing the assertion below. */
  window.__opened = [];
  window.__alerts = [];
  window.__sent = [];
  window.open = (u) => {
    window.__opened.push(String(u));
    const tab = {
      closed: false,
      document: { write: () => {} },
      close() { this.closed = true; },
      location: { set href(v) { window.__sent.push(String(v)); }, get href() { return ""; } },
    };
    return tab;
  };
  window.alert = (m) => { window.__alerts.push(String(m)); };
}, UID);

await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

const press = async (label, steps) => {
  await steps();
  await page.getByRole("button", { name: /Upgrade to premium/ }).first().click({ force: true });
  /* Longer than the old 300ms on purpose: there is a round trip to the
     checkout function between the click and the tab being pointed
     anywhere. */
  await page.waitForTimeout(700);
  return page.evaluate(() => ({ opened: window.__opened, alerts: window.__alerts, sent: window.__sent }));
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
  const { opened, alerts, sent } = await press(label, steps)
    .catch(() => ({ opened: [], alerts: [], sent: [] }));
  const note = alerts.at(-1) || "";

  if (opened.length) {
    fired++;
    /* Opened blank and immediately, inside the click. A tab opened after
       the fetch resolves is a tab Safari refuses to open at all, which
       reads to the customer as the payment being broken. */
    ok(`${label}: opens the tab straight away, blank`, opened.at(-1) === "", opened.at(-1));
    ok(`${label}: then points it at the link the server minted`,
       sent.at(-1) === PAY_LINK, JSON.stringify(sent));
    ok(`${label}: said nothing went wrong`, note === "", note);
  } else if (note) {
    fired++;
    ok(`${label}: explained itself instead of opening nothing`, note.length > 0, note);
  } else {
    ok(`${label}: did something`, false, "neither opened a tab nor said why");
  }
}
ok("all four entry points respond", fired === 4, String(fired));

/* The id is the server's business now. It used to ride in the query string,
   where the customer could edit it and pay as somebody else; the function
   reads it from the token it verifies instead. Nothing the browser builds
   should mention it. */
ok("no URL the browser builds carries the account id",
   await page.evaluate((uid) => ![...window.__opened, ...window.__sent].some((u) => u.includes(uid)), UID),
   "an id in a query string is an id the customer can change");

/* Signed out, checkout must refuse. Taking money that cannot be matched to
   an account is worse than not taking it. */
await page.evaluate(() => { localStorage.removeItem("ros:session"); });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const signedOut = await page.evaluate(() => ({ opened: window.__opened, alerts: window.__alerts }));
ok("signed out, nothing was opened on load", signedOut.opened.length === 0, JSON.stringify(signedOut.opened));

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
  ok("the refusal comes before the tab is opened",
     fn.indexOf("checkoutIsPro") < fn.indexOf("window.open"),
     "a check after window.open is not a check");
  ok("checkoutIsPro tracks the plan the server reported",
     /useEffect\(\(\)\s*=>\s*\{\s*checkoutIsPro\s*=\s*isPro;?\s*\}/.test(src));
  ok("and is cleared on sign-out", /if\s*\(!user\)\s*checkoutIsPro\s*=\s*false/.test(src));
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
