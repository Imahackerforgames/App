import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Opens Settings with the entitlements endpoint answering however we like,
   presses the check button, and reads what it says back. */
async function check(reply, { noRefreshToken = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  const seen = { refreshed: false, authHeaders: [] };
  await page.route(/\/auth\/v1\/token/, (r) => {
    seen.refreshed = true;
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "fresh", refresh_token: "rt2", expires_in: 3600 }) });
  });
  await page.route(/\/rest\/v1\/entitlements/, (r) => {
    seen.authHeaders.push(r.request().headers()["authorization"] || "");
    return reply(r);
  });
  await page.addInitScript((noRefresh) => {
    // A session as a real sign-in leaves it: with a refresh token, and not
    // yet expired. Without the refresh token there is nothing to renew with,
    // which is a different case (covered below).
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "tok", id: "u1",
      ...(noRefresh ? {} : { refresh: "rt" }), expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem("ros:profile", JSON.stringify({ username: "tester", onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  }, noRefreshToken);
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  if (await page.getByText("Where are you located?").count()) {
    await page.selectOption('select[aria-label="State"]', { index: 1 });
    await page.getByRole("button", { name: /Show me opportunities/ }).click();
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /check again/i }).click();
  await page.waitForTimeout(700);
  /* The plan note, not the offline banner. Both are live regions and the
     banner renders first, so take the last one. */
  const note = (await page.getByRole("status").last().textContent().catch(() => "")) || "";
  const body = await page.locator("body").innerText();
  await ctx.close();
  return { note, body, seen };
}

const jsonReply = (status, body) => (r) =>
  r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

console.log("\nWhen the grant is in place");
{
  /* Free on load, premium when the button asks.

     That ordering is the only one a person can actually produce. The link
     is hidden from premium accounts, so a page that already knows you have
     paid has nothing to press — answering `pro` from the very first
     request was testing a screen that cannot exist. It is also the real
     sequence: you were free a moment ago, you paid, and now you are
     asking whether it landed. */
  let calls = 0;
  const freeThenPro = (r) => {
    calls += 1;
    return calls === 1
      ? jsonReply(200, [])(r)
      : jsonReply(200, [{ plan: "pro", expires_at: "2027-09-17T05:12:10Z" }])(r);
  };
  const { note, body, seen } = await check(freeThenPro);
  ok("says premium is active", /Premium is active/i.test(note), note);
  ok("and the Plan row flips to Premium", /Premium/.test(body));
  /* The whole point of the link: it is pressed because the server changed
     after this browser signed in, so it must not trust the stored token. */
  ok("renews the token before asking, even though the stored one was valid",
     seen.refreshed, "no refresh call was made");
  ok("and asks with the renewed token",
     seen.authHeaders.at(-1) === "Bearer fresh", String(seen.authHeaders.at(-1)));
}

console.log("\nWhen the account really is free");
{
  const { note } = await check(jsonReply(200, []));
  ok("says so, and suggests the fix", /still on the free plan/i.test(note) && /sign out/i.test(note), note);
}

console.log("\nWhen the session has expired");
{
  const { note } = await check(jsonReply(401, { message: "JWT expired" }));
  ok("names the expired session", /session has expired/i.test(note), note);
  ok("does not silently claim free", !/still on the free plan/i.test(note), note);
}

console.log("\nWhen the row is blocked or the table is missing");
{
  const { note } = await check(jsonReply(404, { message: 'relation "public.entitlements" does not exist' }));
  ok("passes the server's reason through", /does not exist/i.test(note), note);
}

console.log("\nWhen premium has run out");
{
  const { note } = await check(jsonReply(200, [{ plan: "pro", expires_at: "2020-01-01T00:00:00Z" }]));
  ok("says it expired rather than never existed", /expired/i.test(note), note);
}

console.log("\nWhen the network is down");
{
  const { note } = await check((r) => r.abort());
  ok("says it could not reach the server", /couldn't reach the server/i.test(note), note);
}

console.log("\nWhen the session predates refresh tokens");
{
  /* Sessions saved by older builds have no refresh token, so there is
     nothing to renew with. This is the case that hits some users and not
     others, and it must not read as "you are on the free plan". */
  const { note, seen } = await check(jsonReply(401, { message: "JWT expired" }), { noRefreshToken: true });
  ok("no renewal is attempted when there is nothing to renew with", !seen.refreshed);
  ok("and it says to sign in again rather than claiming free",
     /session has expired/i.test(note) && !/still on the free plan/i.test(note), note);
}

/* ── who is offered it, and how loudly ─────────────────────────────────
   The payment webhook grants premium by itself and the app re-reads the
   plan on tab focus, so this is a fallback for a webhook that failed — not
   a step.

   A full-width button reading "I've paid — check again" is the product
   telling a customer it does not trust its own payments, on the screen
   where they are deciding whether to hand over a card. It also gave
   premium accounts a "Re-check my plan" control that did nothing anyone
   wanted. Both are asserted gone. */
console.log("\nHow prominent it is, and who sees it");
{
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const entitlement = { plan: "free" };
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: entitlement.plan === "pro"
      ? JSON.stringify([{ plan: "pro", expires_at: "2027-09-17T05:12:10Z" }]) : "[]",
  }));
  await page.addInitScript(() => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email",
      token: "tok", id: "u1", refresh: "rt", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem("ros:u:u1:profile", JSON.stringify({ username: "tester", onboarded: true,
      name: "T", state: "Georgia", zip: "30106", theme: "obsidian" }));
  });

  const openSettings = async () => {
    await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /^Settings$/ }).click();
    await page.waitForTimeout(500);
  };

  await openSettings();
  const link = page.getByRole("button", { name: /check again/i });
  ok("a free account is still offered it", (await link.count()) === 1, String(await link.count()));

  /* Quieter than the upgrade button beside it: not full width, not a
     filled pill, and smaller type. */
  const box = await link.boundingBox();
  ok("it is not a full-width button", box.width < 300, `${Math.round(box.width)}px wide`);
  const look = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: parseFloat(s.fontSize), bg: s.backgroundColor, dec: s.textDecorationLine };
  });
  ok("it reads as a link, not a control", /underline/.test(look.dec), JSON.stringify(look));
  ok("with no filled background", /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg), look.bg);
  ok("and smaller than the upgrade button's label", look.size <= 12.5, String(look.size));

  /* Nothing on the paying screens should send somebody looking for it. */
  const body = await page.locator("body").innerText();
  ok("no copy tells anyone to go and press a button",
     !/press the button below|press .I've paid/i.test(body));

  entitlement.plan = "pro";
  await openSettings();
  ok("a premium account is not offered it at all",
     (await page.getByRole("button", { name: /check again|Re-check my plan/i }).count()) === 0);
  ok("premium still gets a way out instead",
     (await page.getByRole("button", { name: /cancel subscription/i }).count()) === 1);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
