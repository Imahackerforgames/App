/* "Manage subscription" — leaving has to be as easy as arriving.

   A subscription you cannot see or stop from inside the product feels like
   a trap, and somebody who feels trapped disputes the charge rather than
   cancelling it. That costs more than the subscription was worth and takes
   the goodwill with it.

   Two halves are checked. In the browser: who is offered the button and
   what they are told. In the endpoint's source: that the Stripe customer
   is read from our own table rather than from the request, which is the
   whole of the authorisation on it. */
import { chromium } from "playwright";
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function settingsAs(plan, routes = () => {}) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  /* After the catch-all so it wins — Playwright matches routes in reverse
     registration order. */
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: plan === "pro" ? JSON.stringify([{ plan: "pro", expires_at: "2026-10-30T23:27:38Z" }]) : "[]",
  }));
  await routes(page);
  await page.addInitScript((uid) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "m@example.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "member", onboarded: true,
      name: "Member", state: "Georgia", zip: "30106", theme: "obsidian" }));
    window.__nav = [];
    /* window.location.href cannot be stubbed, so the click is observed by
       blocking the navigation at the network layer instead. */
  }, "u1");
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /settings/i }).last().click();
  await page.waitForTimeout(800);
  return { ctx, page };
}

// ── 1. who is offered it ───────────────────────────────────────────────
{
  console.log("\n1. A premium member is offered a way out");
  const { ctx, page } = await settingsAs("pro");
  const btn = page.getByRole("button", { name: /manage subscription/i });
  ok("the button is there", (await btn.count()) === 1, String(await btn.count()));

  const body = await page.locator("body").innerText();
  ok("it says cancelling is one of the things it does", /cancel/i.test(body));
  /* People hesitate to cancel because they fear losing time they paid for.
     Saying otherwise up front is the difference between cancelling and
     charging back. */
  ok("and that paid-for time is not lost", /until the end of the period/i.test(body), body.slice(-400));
  ok("card details are still disclaimed", /never sees your card/i.test(body));
  await ctx.close();
}
{
  console.log("\n2. A free account is offered the upgrade, not the exit");
  const { ctx, page } = await settingsAs("free");
  ok("no manage button", (await page.getByRole("button", { name: /manage subscription/i }).count()) === 0);
  ok("upgrade is offered instead", (await page.getByRole("button", { name: /upgrade to premium/i }).count()) >= 1);
  await ctx.close();
}

/* ── 3. premium that was granted by hand ────────────────────────────────
   There is no Stripe customer, so there is nothing to manage. That is the
   likeliest non-paying case, and it must read as an explanation rather
   than as a broken button. */
{
  console.log("\n3. A comped account is told there is nothing to cancel");
  const { ctx, page } = await settingsAs("pro", async (p) => {
    await p.route(/\/functions\/v1\/billing-portal/, (r) => r.fulfill({
      status: 404, contentType: "application/json", body: JSON.stringify({ error: "no_subscription" }) }));
  });
  await page.getByRole("button", { name: /manage subscription/i }).click();
  await page.waitForTimeout(1000);
  const body = await page.locator("body").innerText();
  ok("it explains rather than erroring", /given premium directly/i.test(body), body.slice(-300));
  ok("and confirms no money is moving", /nothing is being charged/i.test(body));
  await ctx.close();
}

/* ── 4. the endpoint refusing ───────────────────────────────────────────
   Whatever goes wrong, a member must get words rather than a dead button. */
{
  console.log("\n4. A failure says something");
  const { ctx, page } = await settingsAs("pro", async (p) => {
    await p.route(/\/functions\/v1\/billing-portal/, (r) => r.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ error: "Billing isn't configured yet. Please contact support." }) }));
  });
  await page.getByRole("button", { name: /manage subscription/i }).click();
  await page.waitForTimeout(1000);
  ok("the reason is shown", /contact support/i.test(await page.locator("body").innerText()));

  /* Reported as "it does not do anything". It did — it showed the reason
     in C.dim at 12px, directly beneath an 11.5px C.dead paragraph, so the
     reply was a third block of grey that read like more help text. A
     response nobody can pick out is the same as no response. */
  const note = page.locator("[role=status]").filter({ hasText: /contact support/i }).first();
  const seen = await note.evaluate((el) => {
    const s = getComputedStyle(el);
    const prev = el.previousElementSibling ? getComputedStyle(el.previousElementSibling) : null;
    return { color: s.color, weight: +s.fontWeight, size: parseFloat(s.fontSize),
             prevColor: prev ? prev.color : null, prevSize: prev ? parseFloat(prev.fontSize) : null };
  });
  ok("it does not wear the same colour as the help text above it",
     seen.color !== seen.prevColor, JSON.stringify(seen));
  ok("it is heavier than body copy", seen.weight >= 600, String(seen.weight));
  ok("and not smaller than the paragraph it must be told apart from",
     seen.size >= (seen.prevSize ?? 0), `${seen.size} vs ${seen.prevSize}`);
  await ctx.close();
}

await b.close();

/* ── 5. the authorisation, read as source ───────────────────────────────
   This link can cancel a subscription and read somebody's invoices. If the
   customer id were taken from the request, anyone who guessed one could
   open another member's billing. The account comes from a verified token;
   the customer comes from the row that account owns. */
{
  console.log("\n5. The portal can only ever open the caller's own billing");
  const fn = readFileSync("/home/user/App/supabase/functions/billing-portal/index.ts", "utf8");
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok("the caller's identity is checked against Supabase, not decoded locally",
     /auth\/v1\/user/.test(code) && /Authorization: auth/.test(code));
  ok("the customer is looked up by the verified user id",
     /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/.test(code), "must not come from the request body");
  ok("no customer id is ever read off the request",
     !/req\.json\(\)/.test(code) && !/body\.customer/.test(code),
     "a caller-supplied customer would open somebody else's billing");
  ok("an unauthenticated caller gets 401", /401/.test(code));
  ok("the service role is used only server-side for that lookup",
     /SERVICE_KEY/.test(code) && !/SERVICE_KEY[^)]*\bjson\(/.test(code));
  ok("a missing or wrong-shaped Stripe key is named, not swallowed",
     /\^\(sk\|rk\)_/.test(code) && /503/.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
