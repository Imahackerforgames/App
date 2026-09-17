import { chromium } from "playwright";
const BASE = "http://localhost:4173/";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

// Each case is a real GoTrue response body, in the shape that version emits.
async function recoverSays(status, body) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", r => r.abort());
  await page.route(/\/auth\/v1\/recover/, r =>
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Forgot?" }).click();
  await page.getByPlaceholder("you@email.com").fill("tester@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.waitForTimeout(400);
  const t = (await page.getByRole("alert").textContent().catch(() => "")) || "";
  await ctx.close();
  return t;
}

async function updateSays(status, body) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", r => r.abort());
  await page.route(/\/auth\/v1\/user$/, r =>
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  await page.goto(BASE + "#access_token=t&expires_in=3600&type=recovery", { waitUntil: "networkidle" });
  await page.getByPlaceholder("Make it a strong one").fill("Str0ng!Pass9");
  await page.getByPlaceholder("Type it once more").fill("Str0ng!Pass9");
  await page.getByRole("button", { name: /Save new password/ }).click();
  await page.waitForTimeout(500);
  const t = (await page.getByRole("alert").textContent().catch(() => "")) || "";
  await ctx.close();
  return t;
}

console.log("\nSending the email");
let t;
t = await recoverSays(500, { code: 500, error_code: "unexpected_failure", msg: "Error sending recovery email" });
ok("broken SMTP is named as the project's problem", /SMTP Settings/i.test(t), t);
ok("...and does not blame the address", !/address is wrong|no account/i.test(t), t);

t = await recoverSays(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 51 seconds." });
ok("a countdown is passed on exactly", /51 seconds/.test(t), t);

t = await recoverSays(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" });
ok("a limit with no countdown does not promise a time",
   /try again a little later/i.test(t) && !/minute|second/i.test(t), t);

t = await recoverSays(500, { msg: "Error sending recovery email" });
ok("older shape with no code still reaches SMTP advice", /SMTP Settings/i.test(t), t);

t = await recoverSays(400, { error: "validation_failed", error_description: "Unable to validate email address" });
ok("unknown errors keep their own text", /validate email address/i.test(t), t);
ok("...and carry a code for diagnosis", /validation_failed|\[400\]/.test(t), t);

console.log("\nSaving the new password");
t = await updateSays(422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
ok("reused password explained plainly", /already had/i.test(t), t);

t = await updateSays(422, { code: 422, error_code: "weak_password", msg: "Password is known to be weak and easy to guess" });
ok("breached password explained", /easy to guess/i.test(t), t);

t = await updateSays(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" });
ok("dead recovery session reads as expired", /expired/i.test(t), t);

t = await updateSays(403, { code: 403, error_code: "reauthentication_needed", msg: "A reauthentication is needed" });
ok("reauthentication explained", /fresh login/i.test(t), t);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
