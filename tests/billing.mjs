/* "Cancel subscription" — leaving has to be as easy as arriving.

   A subscription you cannot see or stop from inside the product feels like
   a trap, and somebody who feels trapped disputes the charge rather than
   cancelling it. That costs more than the subscription was worth and takes
   the goodwill with it.

   What this checks changed when Stripe went away. There is no billing
   portal to open any more: Stripe's portal was the right answer while
   Stripe took the money, and Commas — the merchant of record now — is not
   known to expose one. So the button sends a cancellation request to a
   person instead, and the thing worth protecting is that it never claims
   to have done something it has not.

   The failure this exists to prevent is specific and was one deploy away.
   billing-portal answers "no_subscription" for every account now, and the
   app rendered that as "nothing is being charged" — a comforting sentence
   shown to somebody whose card is charged every month. Assertion 5 is what
   stops that button coming back. */
import { chromium } from "playwright";
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const SUPPORT = "reamp.store@gmail.com";
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
  const btn = page.getByRole("button", { name: /cancel subscription/i });
  ok("the button is there", (await btn.count()) === 1, String(await btn.count()));

  const body = await page.locator("body").innerText();
  /* People hesitate to cancel because they fear losing time they paid for.
     Saying otherwise up front is the difference between cancelling and
     charging back. */
  ok("paid-for time is not lost", /until the end of the period/i.test(body), body.slice(-400));
  ok("card details are still disclaimed", /never sees your card/i.test(body));
  /* No reason, no retention flow, no "are you sure". A cancellation made
     awkward is a chargeback with extra steps. */
  ok("no reason is demanded", /no reason needed/i.test(body));
  await ctx.close();
}
{
  console.log("\n2. A free account is offered the upgrade, not the exit");
  const { ctx, page } = await settingsAs("free");
  ok("no cancel button", (await page.getByRole("button", { name: /cancel subscription/i }).count()) === 0);
  ok("upgrade is offered instead", (await page.getByRole("button", { name: /upgrade to premium/i }).count()) >= 1);
  await ctx.close();
}

/* ── 3. the tap does something, visibly ─────────────────────────────────
   A mailto cannot be observed from in here — window.location.href is not
   stubbable and an external protocol never reaches the network layer. What
   can be checked is the half that a person actually depends on: that the
   tap produces an answer naming the address, so somebody whose mail app
   does not open is not left staring at a button that did nothing.

   That exact failure has happened on this screen before, which is why it
   is asserted rather than assumed. */
{
  console.log("\n3. Tapping it answers, and names the address");
  const { ctx, page } = await settingsAs("pro");
  await page.getByRole("button", { name: /cancel subscription/i }).click({ force: true });
  await page.waitForTimeout(600);

  const note = page.locator("[role=status]").filter({ hasText: /email/i }).first();
  ok("an answer appears", (await note.count()) === 1, String(await note.count()));
  const text = await note.innerText().catch(() => "");
  ok("it names the address to write to", text.includes(SUPPORT), text);
  ok("and says what to do if no mail app opens", /if nothing opens/i.test(text), text);

  /* Reported once as "it does not do anything". It did — it showed the
     reply in C.dim at 12px directly beneath an 11.5px C.dead paragraph, so
     the answer was a third block of grey that read like more help text. A
     response nobody can pick out is the same as no response. */
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

/* ── 4. what the button actually builds ─────────────────────────────────
   Read as source, because the browser cannot see a mailto leave. The
   address has to be the real support inbox and the mail has to arrive
   already saying what it is for — a blank mail window is a cancellation
   somebody abandons. */
{
  console.log("\n4. The request is addressed and prefilled");
  const src = readFileSync("/home/user/App/src/App.jsx", "utf8");
  const fn = (src.split(/function cancellationRequest\s*\(/)[1] || "").split(/\n}/)[0];

  ok("it is a mailto to the support address", /mailto:\$\{SUPPORT_EMAIL\}/.test(fn), fn.slice(0, 200));
  ok("the support address is the one in the legal pages",
     new RegExp(`SUPPORT_EMAIL\\s*=\\s*"${SUPPORT}"`)
       .test(readFileSync("/home/user/App/src/legal.jsx", "utf8")));
  ok("the subject says what it is", /subject=/.test(fn) && /[Cc]ancel my Reamp premium/.test(fn));
  ok("the account is named in the body so it can be acted on",
     /body=/.test(fn) && /Account:/.test(fn));
  ok("both are encoded rather than pasted raw",
     (fn.match(/encodeURIComponent/g) || []).length >= 2, fn);
}

/* ── 5. Stripe's portal cannot come back by accident ────────────────────
   The endpoint is still deployed and still works; it is the *button* that
   must not return. Every account now has no Stripe customer, so that
   button tells a paying member their card is not being charged. */
{
  console.log("\n5. The app no longer opens a Stripe billing portal");
  const src = readFileSync("/home/user/App/src/App.jsx", "utf8");
  /* Comments stripped, because the question is what reaches a screen. The
     reasoning for the removal is written above the code that replaced it
     and quotes the sentence it removed, which is not the same as shipping
     it. Whole-line // only, so URLs survive. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok("nothing calls billing-portal", !/billing-portal/.test(code),
     "that endpoint answers no_subscription for every account now");
  ok("there is no portal helper left to call", !/openBillingPortal/.test(code));
  ok("and no 'nothing is being charged' copy survives",
     !/nothing is being charged/i.test(code),
     "shown to somebody who is being charged, that is how a cancel becomes a chargeback");

  /* Both Stripe functions stay in the repo as the record of how it worked.
     A header saying so is what stops the next person deploying one back
     into a live Commas setup. */
  for (const f of ["stripe-webhook", "billing-portal"]) {
    const head = readFileSync(`/home/user/App/supabase/functions/${f}/index.ts`, "utf8").slice(0, 700);
    ok(`${f} is marked retired at the top of the file`, /RETIRED/.test(head), head.slice(0, 120));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
