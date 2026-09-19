/* What a person sees when the app throws.

   Without a boundary React unmounts the whole tree and leaves an empty
   root: a blank white page with no message and no way back. The person
   concludes the site is broken, leaves, and nobody finds out. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const UID = "u1";
async function app({ corrupt = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 880 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  /* Seeded once via evaluate rather than addInitScript, which would re-run
     on every navigation and undo anything the page itself clears — that
     would make the sign-out escape hatch look broken when it is not. */
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(([uid, bad]) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
    /* Valid JSON, wrong shape. The app parses it happily and then calls
       .map on an object during render — a realistic corrupted-cache crash,
       not a contrived throw. */
    if (bad) localStorage.setItem(`ros:u:${uid}:inventory`, JSON.stringify({ not: "an array" }));
  }, [UID, corrupt]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// ── 1. a crash shows something, not nothing ────────────────────────────
{
  console.log("\n1. A crash is explained rather than shown as a blank page");
  const { ctx, page } = await app({ corrupt: true });
  const body = (await page.locator("body").innerText()).trim();

  ok("the page is not blank", body.length > 40, `${body.length} chars`);
  ok("it says something went wrong", /something went wrong/i.test(body), body.slice(0, 120));
  ok("it says the fault is ours, not theirs", /not something you did/i.test(body));
  ok("it reassures them about their data", /data is safe/i.test(body));
  ok("there is a way out", await page.getByRole("button", { name: /Reload the page/i }).count() === 1);
  ok("and an escape hatch for a crash loop",
     await page.getByRole("button", { name: /Sign out and reload/i }).count() === 1);
  ok("the actual error is shown so it can be reported", /is not a function|map/i.test(body), body.slice(-160));
  ok("on the app's dark background, not a white flash",
     await page.evaluate(() => getComputedStyle(document.body).backgroundColor) !== "rgb(255, 255, 255)");
  await page.screenshot({ path: "shot-crash.png" });
  await ctx.close();
}

// ── 2. the escape hatch actually escapes ───────────────────────────────
{
  console.log("\n2. Sign out and reload breaks the loop");
  const { ctx, page } = await app({ corrupt: true });
  await page.getByRole("button", { name: /Sign out and reload/i }).click();
  await page.waitForTimeout(1800);
  const after = await page.locator("body").innerText();
  ok("it lands on the login screen", /Log in|Sign up/i.test(after), after.slice(0, 100));
  ok("the session is gone", !(await page.evaluate(() => localStorage.getItem("ros:session"))));
  ok("but the data is NOT deleted",
     !!(await page.evaluate((u) => localStorage.getItem(`ros:u:${u}:inventory`), UID)));
  await ctx.close();
}

// ── 3. it stays out of the way when nothing is wrong ───────────────────
{
  console.log("\n3. A healthy app is untouched");
  const { ctx, page } = await app();
  const body = await page.locator("body").innerText();
  ok("no error screen", !/something went wrong/i.test(body));
  ok("the app rendered", /Good (morning|afternoon|evening)|Home/i.test(body), body.slice(0, 100));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
