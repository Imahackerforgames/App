import { chromium } from "playwright";

const BASE = "http://localhost:4173/";
const SUPA = "https://ggfqqybjcljtqezyuxyx.supabase.co";
const RECOVERY_TOKEN = "eyJRECOVERYtokenFAKE.payload.sig";

let pass = 0, fail = 0;
const ok  = (n, c, extra = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (extra ? "  <- " + extra : ""))); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// One page factory so every test starts from a clean profile.
async function newPage({ recoverFails = null, updateFails = null, sessionRevoked = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const calls = [];
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  // Catch-all FIRST — Playwright matches the most recently added route first,
  // so registering it last would swallow the specific handlers below.
  await page.route("**://*.supabase.co/**", (r) => r.abort());

  await page.route(/\/auth\/v1\/recover/, async (r) => {
    const req = r.request();
    calls.push({ kind: "recover", url: req.url(), method: req.method(), body: req.postDataJSON() });
    if (recoverFails) return r.fulfill({ status: recoverFails, contentType: "application/json", body: JSON.stringify({ msg: "over_email_send_rate_limit" }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/auth\/v1\/user$/, async (r) => {
    const req = r.request();
    calls.push({ kind: "user", method: req.method(), auth: req.headers()["authorization"], body: req.postDataJSON() });
    if (req.method() === "PUT" && updateFails) {
      return r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ msg: updateFails }) });
    }
    // The post-change liveness check is a GET on the same path.
    if (req.method() === "GET" && sessionRevoked) {
      return r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ msg: "invalid JWT" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ id: "user-123", email: "tester@example.com" }) });
  });

  await page.route(/\/auth\/v1\/verify/, async (r) => {
    const req = r.request();
    const body = req.postDataJSON();
    calls.push({ kind: "verify", body });
    if (body?.token !== "123456") {
      return r.fulfill({ status: 403, contentType: "application/json",
        body: JSON.stringify({ msg: "Token has expired or is invalid" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "code_tok", refresh_token: "code_rt", expires_in: 3600,
        user: { id: "user-123", email: "tester@example.com" } }) });
  });

  // Entitlement lookup once we land in the app.
  await page.route(/\/rest\/v1\/entitlements/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  return { ctx, page, calls };
}

const strong = "Str0ng!Pass9";

// ───────────────────────────────────────── 1. the button exists on login
{
  console.log("\n1. Forgot button on the login tab");
  const { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: "Forgot?" });
  ok("'Forgot?' is visible on the log-in tab", await btn.isVisible());

  // and must NOT be on sign-up, where there's nothing to have forgotten
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.waitForTimeout(150);
  ok("hidden on the sign-up tab", (await btn.count()) === 0);
  await ctx.close();
}

// ───────────────────────────────────────── 2. sending the email
{
  console.log("\n2. Requesting a reset link");
  const { ctx, page, calls } = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  // type an address on the login form first — it should carry over
  await page.getByPlaceholder("you@email.com").fill("tester@example.com");
  await page.getByRole("button", { name: "Forgot?" }).click();
  await page.waitForTimeout(200);

  ok("reset screen opens", await page.getByText("Reset your password").isVisible());
  const carried = await page.getByPlaceholder("you@email.com").inputValue();
  ok("address carried over from the login field", carried === "tester@example.com", carried);

  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForTimeout(400);

  const c = calls.find((x) => x.kind === "recover");
  ok("POSTed to /auth/v1/recover", !!c && c.method === "POST");
  ok("body carries the email", c?.body?.email === "tester@example.com", JSON.stringify(c?.body));
  const rt = c ? new URL(c.url).searchParams.get("redirect_to") : null;
  ok("redirect_to points back at the app", rt === "http://localhost:4173/", String(rt));

  ok("confirmation shown", await page.getByText("Check your email").isVisible());
  const hedged = await page.getByText(/If an account exists for/).isVisible();
  ok("confirmation does not confirm the account exists", hedged);
  await ctx.close();
}

// ───────────────────────────────────────── 3. username is not carried over
{
  console.log("\n3. A username in the login field is not carried over");
  const { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Username", exact: true }).click();
  await page.getByPlaceholder("Your username").fill("Moneyman");
  await page.getByRole("button", { name: "Forgot?" }).click();
  await page.waitForTimeout(200);
  const v = await page.getByPlaceholder("you@email.com").inputValue();
  ok("email field left empty, not seeded with a username", v === "", v);
  const disabled = await page.getByRole("button", { name: "Send reset link" }).isDisabled();
  ok("send button disabled with no address", disabled);
  await ctx.close();
}

// ───────────────────────────────────────── 4. rate limit
{
  console.log("\n4. Rate limit is reported, not swallowed");
  const { ctx, page } = await newPage({ recoverFails: 429 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Forgot?" }).click();
  await page.getByPlaceholder("you@email.com").fill("tester@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForTimeout(400);
  ok("429 surfaces a wait message", await page.getByRole("alert").isVisible());
  ok("and does not claim the mail was sent", (await page.getByText("Check your email").count()) === 0);
  await ctx.close();
}

// ───────────────────────────────────────── 5. landing from the email link
{
  console.log("\n5. Landing on the reset screen from the emailed link");
  const { ctx, page, calls } = await newPage();
  const hash = `#access_token=${RECOVERY_TOKEN}&refresh_token=rt_abc&expires_in=3600&token_type=bearer&type=recovery`;
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  ok("reset screen shown", await page.getByText("Set a new password").isVisible());
  ok("tokens stripped from the address bar", !(await page.evaluate(() => location.hash)),
     await page.evaluate(() => location.hash));

  // mismatch is blocked
  await page.getByPlaceholder("Make it a strong one").fill(strong);
  await page.getByPlaceholder("Type it once more").fill("Different1!");
  await page.waitForTimeout(150);
  ok("mismatch shows the hint", await page.getByText("Both passwords have to match").isVisible());
  ok("mismatch keeps the button disabled",
     await page.getByRole("button", { name: /Save new password/ }).isDisabled());

  // weak password is blocked even though it matches
  await page.getByPlaceholder("Make it a strong one").fill("weak");
  await page.getByPlaceholder("Type it once more").fill("weak");
  await page.waitForTimeout(150);
  ok("weak-but-matching is still blocked",
     await page.getByRole("button", { name: /Save new password/ }).isDisabled());

  // the real thing
  await page.getByPlaceholder("Make it a strong one").fill(strong);
  await page.getByPlaceholder("Type it once more").fill(strong);
  await page.waitForTimeout(150);
  ok("strong + matching enables the button",
     !(await page.getByRole("button", { name: /Save new password/ }).isDisabled()));

  await page.getByRole("button", { name: /Save new password/ }).click();
  await page.waitForTimeout(700);

  const put = calls.find((x) => x.kind === "user" && x.method === "PUT");
  ok("PUT /auth/v1/user sent", !!put);
  ok("new password in the body", put?.body?.password === strong);
  ok("authorised with the recovery token", put?.auth === `Bearer ${RECOVERY_TOKEN}`, put?.auth);

  // Always back to the login screen, never straight into the app.
  const body = await page.locator("body").innerText();
  ok("returns to the login screen", /Welcome back/.test(body) && !/Set a new password/.test(body),
     body.slice(0, 140));
  ok("confirms the change worked", /Password changed/i.test(body));
  const prefilled = await page.getByPlaceholder("you@email.com").inputValue();
  ok("email prefilled", prefilled === "tester@example.com", prefilled);
  ok("recovery session not carried into storage",
     !(await page.evaluate(() => localStorage.getItem("ros:session"))));
  await ctx.close();
}

// ───────────────────────────────────────── 6. expired link
{
  console.log("\n6. Expired link");
  const { ctx, page } = await newPage();
  const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  ok("expired screen shown", await page.getByText("This link has expired").isVisible());
  ok("no password fields offered", (await page.getByPlaceholder("Make it a strong one").count()) === 0);
  await page.getByRole("button", { name: "Send a new link" }).click();
  await page.waitForTimeout(250);
  ok("routes into the request form", await page.getByText("Reset your password").isVisible());
  ok("hash cleared", !(await page.evaluate(() => location.hash)));
  await ctx.close();
}

// ───────────────────────────────────────── 7. reset beats a stored session
{
  console.log("\n7. A stored session does not hijack the reset");
  const { ctx, page } = await newPage();
  // Seed the session before anything loads, so the link can be the very
  // first navigation — a click from an email is a full page load, and a
  // goto from BASE to BASE#... would only be a same-document hash change.
  await page.addInitScript(() => localStorage.setItem("ros:session",
    JSON.stringify({ email: "someone@else.com", provider: "email", token: "old", id: "u9" })));
  const hash = `#access_token=${RECOVERY_TOKEN}&refresh_token=rt_abc&expires_in=3600&type=recovery`;
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  ok("reset screen wins over the stored session", await page.getByText("Set a new password").isVisible());
  await ctx.close();
}

// ───────────────────────────────────────── 7b. pasted into an open tab
{
  console.log("\n7b. Link pasted into a tab that already has the app open");
  const { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Only the hash changes — the browser does not reload the document.
  await page.evaluate((t) => {
    location.hash = `access_token=${t}&refresh_token=rt_abc&expires_in=3600&type=recovery`;
  }, RECOVERY_TOKEN);
  await page.waitForTimeout(500);
  ok("hashchange is picked up", await page.getByText("Set a new password").isVisible());
  ok("hash cleared here too", !(await page.evaluate(() => location.hash)),
     await page.evaluate(() => location.hash));
  await ctx.close();
}

// ───────────────────────────────────────── 8. server rejects the new password
{
  console.log("\n8. Server rejecting the new password");
  const { ctx, page } = await newPage({ updateFails: "New password should be different from the old password." });
  const hash = `#access_token=${RECOVERY_TOKEN}&expires_in=3600&type=recovery`;
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Make it a strong one").fill(strong);
  await page.getByPlaceholder("Type it once more").fill(strong);
  await page.getByRole("button", { name: /Save new password/ }).click();
  await page.waitForTimeout(500);
  const alert = await page.getByRole("alert").textContent();
  ok("rejection is shown to the user", /already had/i.test(alert || ""), alert);
  ok("stays on the reset screen", await page.getByText("Set a new password").isVisible());
  ok("nothing signed in", !(await page.evaluate(() => localStorage.getItem("ros:session"))));
  await ctx.close();
}

// ───────────────────────────────────────── 9. normal sign-in still works
{
  console.log("\n9. Nothing else on the auth screen moved");
  const { ctx, page } = await newPage();
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1" } }) }));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByPlaceholder("you@email.com").fill("tester@example.com");
  await page.getByPlaceholder("Your password").fill(strong);
  await page.getByRole("button", { name: /^Log in$/ }).last().click();
  await page.waitForTimeout(800);
  const body9 = await page.locator("body").innerText();
  ok("ordinary email sign-in still leaves the auth screen",
     !/Welcome back/.test(body9), body9.slice(0, 120));
  await ctx.close();
}

// ───────────────────────────────────────── 10. the sent screen
{
  console.log("\n10. The check-your-email screen offers one thing: resend");
  const { ctx, page, calls } = await newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Forgot?" }).click();
  await page.getByPlaceholder("you@email.com").fill("tester@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForTimeout(400);

  ok("says to check the email", await page.getByText("Check your email").isVisible());
  ok("names the link, not a code",
     /password reset link/i.test(await page.locator("body").innerText()));
  ok("no code box anywhere", (await page.getByPlaceholder("000000").count()) === 0);
  ok("no continue-with-code button",
     (await page.getByRole("button", { name: /Continue with code/ }).count()) === 0);
  ok("a resend button is offered",
     await page.getByRole("button", { name: /Resend email/ }).isVisible());

  const before = calls.filter((c) => c.kind === "recover").length;
  await page.getByRole("button", { name: /Resend email/ }).click();
  await page.waitForTimeout(400);
  const after = calls.filter((c) => c.kind === "recover").length;
  ok("resend actually sends another", after === before + 1, `${before} -> ${after}`);
  ok("and stays on the same screen", await page.getByText("Check your email").isVisible());
  await ctx.close();
}

// ───────────────────────────────────────── 11. session revoked by the change
{
  console.log("\n11. A revoked session changes nothing — the ending is fixed");
  const { ctx, page, calls } = await newPage({ sessionRevoked: true });
  const hash = `#access_token=${RECOVERY_TOKEN}&expires_in=3600&type=recovery`;
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Make it a strong one").fill(strong);
  await page.getByPlaceholder("Type it once more").fill(strong);
  await page.getByRole("button", { name: /Save new password/ }).click();
  await page.waitForTimeout(800);

  ok("the change was still sent", !!calls.find((x) => x.kind === "user" && x.method === "PUT"));
  const body = await page.locator("body").innerText();
  ok("lands on the login form", /Log in/.test(body) && !/Set a new password/.test(body));
  ok("says the change worked", /Password changed/i.test(body), body.slice(0, 200));
  const prefilled = await page.getByPlaceholder("you@email.com").inputValue();
  ok("email prefilled so they only type the password", prefilled === "tester@example.com", prefilled);
  ok("no session handed to the app either way",
     !(await page.evaluate(() => localStorage.getItem("ros:session"))));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
