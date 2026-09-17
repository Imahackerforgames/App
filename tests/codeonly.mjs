import { chromium } from "playwright";

/* One walk through the code-only journey, with a fake Supabase that behaves
   the way the real one does: /recover mails a code, /verify trades that code
   for a session, /user changes the password. No link is ever touched. */

const BASE = "http://localhost:4173/";
const EMAIL = "antoniowest0131@gmail.com";
const NEWPW = "Str0ng!Pass9";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

// The inbox this fake Supabase "sends" to.
let inbox = null;
let passwordOnFile = "OldPassw0rd!";
let spentCodes = new Set();

await page.route("**://*.supabase.co/**", (r) => r.abort());

await page.route(/\/auth\/v1\/recover/, async (r) => {
  // Real GoTrue mints a fresh 6-digit token and mails it.
  // Eight digits on purpose: Supabase's OTP length is a project setting that
  // runs to ten, and the app used to reject anything but six.
  inbox = String(Math.floor(10000000 + Math.random() * 90000000));
  console.log(`     [inbox] code emailed: ${inbox}`);
  return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

await page.route(/\/auth\/v1\/verify/, async (r) => {
  const body = r.request().postDataJSON();
  const bad = body?.token !== inbox || spentCodes.has(body?.token) || body?.type !== "recovery";
  if (bad) {
    return r.fulfill({ status: 403, contentType: "application/json",
      body: JSON.stringify({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }) });
  }
  spentCodes.add(body.token);          // single use, like the real thing
  return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "sess_from_code", refresh_token: "rt", expires_in: 3600,
      user: { id: "u1", email: EMAIL } }) });
});

await page.route(/\/auth\/v1\/user$/, async (r) => {
  const req = r.request();
  if (req.method() === "PUT") {
    const pw = req.postDataJSON()?.password;
    if (pw === passwordOnFile) {
      return r.fulfill({ status: 422, contentType: "application/json",
        body: JSON.stringify({ code: 422, error_code: "same_password",
          msg: "New password should be different from the old password." }) });
    }
    passwordOnFile = pw;
    console.log(`     [server] password on file is now: ${pw}`);
  }
  return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ id: "u1", email: EMAIL }) });
});

await page.route(/\/auth\/v1\/token/, async (r) => {
  const pw = r.request().postDataJSON()?.password;
  if (pw !== passwordOnFile) {
    return r.fulfill({ status: 400, contentType: "application/json",
      body: JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }) });
  }
  return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1" } }) });
});

await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

console.log("\nThe journey, start to finish\n");

// 1. forgot
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Forgot?" }).click();
await page.waitForTimeout(200);
ok("1. tapping FORGOT? opens the request screen", await page.getByText("Reset your password").isVisible());

// 2. ask for it
await page.getByPlaceholder("you@email.com").fill(EMAIL);
await page.getByRole("button", { name: "Send reset link" }).click();
await page.waitForTimeout(400);
ok("2. the email goes out", inbox !== null);
ok("3. the code box is waiting", await page.getByPlaceholder("000000").isVisible());

// 3. a wrong code is refused
await page.getByPlaceholder("000000").fill("000001");
await page.getByRole("button", { name: /Continue with code/ }).click();
await page.waitForTimeout(400);
ok("4. a wrong code is refused", await page.getByRole("alert").isVisible());
ok("5. and does not let you through", (await page.getByText("Set a new password").count()) === 0);

// 4. the real code
await page.getByPlaceholder("000000").fill(inbox);
await page.getByRole("button", { name: /Continue with code/ }).click();
await page.waitForTimeout(500);
ok("6. the emailed code opens the change-password page", await page.getByText("Set a new password").isVisible());

// 5. reusing the old password is refused by the server
await page.getByPlaceholder("Make it a strong one").fill("OldPassw0rd!");
await page.getByPlaceholder("Type it once more").fill("OldPassw0rd!");
await page.getByRole("button", { name: /Save new password/ }).click();
await page.waitForTimeout(500);
ok("7. reusing the old password is refused, in plain words",
   /already had/i.test((await page.getByRole("alert").textContent()) || ""));

// 6. set a real new one
await page.getByPlaceholder("Make it a strong one").fill(NEWPW);
await page.getByPlaceholder("Type it once more").fill(NEWPW);
await page.getByRole("button", { name: /Save new password/ }).click();
await page.waitForTimeout(700);
ok("8. the password is actually changed on the server", passwordOnFile === NEWPW, passwordOnFile);
const body = await page.locator("body").innerText();
ok("9. lands back on login, told it worked", /Password changed/i.test(body));
ok("10. email already filled in",
   (await page.getByPlaceholder("you@email.com").inputValue()) === EMAIL);

// 7. the old password no longer works
await page.getByPlaceholder("Your password").fill("OldPassw0rd!");
await page.getByRole("button", { name: /^Log in$/ }).last().click();
await page.waitForTimeout(600);
ok("11. the OLD password is now rejected",
   /Invalid login credentials/i.test((await page.getByRole("alert").textContent()) || ""));

// 8. the new one does
await page.getByPlaceholder("Your password").fill(NEWPW);
await page.getByRole("button", { name: /^Log in$/ }).last().click();
await page.waitForTimeout(900);
const after = await page.locator("body").innerText();
ok("12. the NEW password signs in", !/Welcome back/.test(after), after.slice(0, 100));

// 9. and the code cannot be used twice
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Forgot?" }).click();
await page.getByPlaceholder("you@email.com").fill(EMAIL);
const used = inbox;
await page.getByRole("button", { name: "Send reset link" }).click();
await page.waitForTimeout(400);
await page.getByPlaceholder("000000").fill(used);
await page.getByRole("button", { name: /Continue with code/ }).click();
await page.waitForTimeout(500);
ok("13. an already-used code is refused", await page.getByRole("alert").isVisible());

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
