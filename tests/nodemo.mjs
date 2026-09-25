/* A connection problem must never become a fake session.

   Sign-in used to fall through to "demo mode" when the network failed. It
   was a development convenience and a data-loss bug in front of a real
   customer: the session it handed back had no account id, so everything
   the person entered was stored under a key their real account would never
   read. A week of inventory, then a proper sign-in, then nothing there.

   This is the test that keeps it gone. It is the kind of shortcut that
   creeps back the next time somebody is debugging offline. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function offline() {
  const c = await b.newContext({ viewport: { width: 400, height: 900 } });
  const page = await c.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  /* Every Supabase call fails at the network layer — exactly the condition
     that used to trigger the fallback. */
  await page.route("**://*.supabase.co/**", (r) => r.abort("failed"));
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  return { c, page };
}

const signedIn = (page) => page.evaluate(() => !!localStorage.getItem("ros:session"));

// ── 1. signing in with a dead connection ───────────────────────────────
{
  console.log("\n1. A failed sign-in stays on the sign-in screen");
  const { c, page } = await offline();
  /* By type, not by placeholder — the login screen's password field is
     labelled differently from the sign-up one, and filling the wrong box
     left the form invalid, which looked like the fallback being gone when
     it was really the fixture never submitting. */
  await page.locator('input:visible').first().fill("someone@example.com");
  await page.locator('input[type="password"]:visible').first().fill("Str0ng!Pass9");
  /* Two buttons read "Log in": the mode tab at the top and the submit at
     the bottom. .first() was clicking the tab, so nothing was ever
     submitted and the screen looked unchanged for the wrong reason. */
  await page.getByRole("button", { name: /^Log in$/ }).last().click({ force: true });
  await page.waitForTimeout(2500);

  const body = await page.locator("body").innerText();
  ok("no demo mode anywhere", !/demo mode/i.test(body), body.match(/.{0,60}demo.{0,40}/i)?.[0]);
  ok("it says the server is unreachable", /can't reach the server/i.test(body), body.slice(0, 240));
  ok("no session was written", !(await signedIn(page)));
  ok("still on the auth screen", /sign in|sign up/i.test(body));
  await c.close();
}

// ── 2. signing up with a dead connection ───────────────────────────────
{
  console.log("\n2. A failed sign-up does not create a local identity");
  const { c, page } = await offline();
  await page.getByRole("button", { name: /^Sign up$/ }).first().click({ force: true });
  await page.waitForTimeout(500);
  const boxes = page.locator("input:visible");
  await boxes.nth(0).fill("newperson@example.com");
  await boxes.nth(1).fill("Str0ng!Pass9");
  await page.getByRole("button", { name: /Create account/i }).click({ force: true });
  await page.waitForTimeout(2500);

  const body = await page.locator("body").innerText();
  ok("no demo mode", !/demo mode/i.test(body), body.match(/.{0,60}demo.{0,40}/i)?.[0]);
  ok("the failure is reported", /can't reach the server/i.test(body), body.slice(0, 240));
  ok("no session was written", !(await signedIn(page)));
  await c.close();
}

/* ── 3. the string itself ───────────────────────────────────────────────
   The shipped bundle should not contain the phrase at all. If it comes
   back, this fails before anybody has to notice it in the product. */
{
  console.log("\n3. The phrase is not in the shipped code");
  const { readFileSync, readdirSync } = await import("fs");
  const files = readdirSync("/home/user/App/dist/assets").filter((f) => f.endsWith(".js"));
  const src = files.map((f) => readFileSync(`/home/user/App/dist/assets/${f}`, "utf8")).join("");
  ok("no 'demo mode' in the bundle", !/demo mode/i.test(src));
  ok("no 'provider:\"demo\"' in the bundle", !/provider:\s*"demo"/.test(src));
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
