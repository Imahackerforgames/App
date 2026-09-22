import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* A fake Supabase that behaves like the real one on the points that matter:
   it stores the address lowercased, and it refuses a password grant whose
   email does not match exactly what it holds. */
async function app({ storedEmail = "user@example.com", password = "Str0ng!Pass9" } = {}) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  const seen = { grants: [], logouts: 0, signups: [] };
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/auth\/v1\/logout/, (r) => { seen.logouts++; return r.fulfill({ status: 204, body: "" }); });
  await page.route(/\/auth\/v1\/signup/, (r) => {
    seen.signups.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1" } }) });
  });
  await page.route(/\/auth\/v1\/token/, (r) => {
    const body = r.request().postDataJSON() || {};
    seen.grants.push(body);
    if (body.email !== storedEmail || body.password !== password) {
      return r.fulfill({ status: 400, contentType: "application/json",
        body: JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, user: { id: "u1" } }) });
  });
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.addInitScript(() => localStorage.setItem("ros:profile",
    JSON.stringify({ username: "tester", onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 })));
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return { ctx, page, seen };
}

const login = async (page, email, pw) => {
  await page.getByPlaceholder("you@email.com").fill(email);
  await page.getByPlaceholder("Your password").fill(pw);
  await page.getByRole("button", { name: /^Log in$/ }).last().click();
  await page.waitForTimeout(700);
};

console.log("\nSigning in with the address typed differently");
{
  const { ctx, page, seen } = await app();
  // Exactly how someone's phone capitalises the first letter for them.
  await login(page, "  User@Example.com ", "Str0ng!Pass9");
  ok("the address is sent lowercased and trimmed",
     seen.grants.at(-1)?.email === "user@example.com", JSON.stringify(seen.grants.at(-1)?.email));
  ok("so the sign-in succeeds", !/Welcome back/.test(await page.locator("body").innerText()));
  await ctx.close();
}

console.log("\nThe password is left exactly as typed");
{
  const { ctx, page, seen } = await app({ password: "  Spaces Matter 9!  " });
  await login(page, "user@example.com", "  Spaces Matter 9!  ");
  ok("not trimmed, not lowercased",
     seen.grants.at(-1)?.password === "  Spaces Matter 9!  ",
     JSON.stringify(seen.grants.at(-1)?.password));
  await ctx.close();
}

console.log("\nA genuinely wrong password still fails");
{
  const { ctx, page } = await app();
  await login(page, "user@example.com", "WrongPass1!");
  ok("refused", /Invalid login credentials/i.test(await page.locator("body").innerText()));
  ok("and stays on the login screen", /Welcome back/.test(await page.locator("body").innerText()));
  await ctx.close();
}

console.log("\nSigning up normalises the address too");
{
  const { ctx, page, seen } = await app();
  await page.getByRole("button", { name: "Sign up", exact: true }).first().click();
  await page.waitForTimeout(200);
  // No username here any more -- sign-up is email and password, and the
  // username is chosen on the screen after the account exists.
  await page.getByPlaceholder("you@email.com").fill("New.Person@Example.COM");
  await page.getByPlaceholder("Make it a strong one").fill("Str0ng!Pass9");
  await page.getByRole("button", { name: /Create account/ }).click();
  await page.waitForTimeout(700);
  ok("stored lowercased", seen.signups.at(-1)?.email === "new.person@example.com",
     JSON.stringify(seen.signups.at(-1)?.email));
  await ctx.close();
}

console.log("\nSigning out revokes the session server-side");
{
  const { ctx, page, seen } = await app();
  await login(page, "user@example.com", "Str0ng!Pass9");
  ok("signed in first", !/Welcome back/.test(await page.locator("body").innerText()));

  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.waitForTimeout(800);
  ok("back on the login screen", /Welcome back/.test(await page.locator("body").innerText()));
  ok("Supabase was told, not just local storage", seen.logouts === 1, `logout calls: ${seen.logouts}`);
  ok("and the stored session is gone",
     !(await page.evaluate(() => localStorage.getItem("ros:session"))));

  // And straight back in again, which is the whole point.
  await login(page, "user@example.com", "Str0ng!Pass9");
  ok("signing back in works immediately", !/Welcome back/.test(await page.locator("body").innerText()));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
