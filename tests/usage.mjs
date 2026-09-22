/* The Usage panel in Settings.

   Both allowances are invisible without this. A cap nobody can see is
   indistinguishable from the app being broken — you press search, or ask a
   question, nothing happens, and there is no way to learn why.

   The rule these tests protect: the panel shows what the server said, or
   it shows nothing. An invented number would be worse than no number,
   because somebody who believes they have thirty left and gets refused at
   ten has been misled by their own settings screen. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const UID = "u1";

const quota = (limit, used, minsLeft = 41) => ({
  limit, used, remaining: Math.max(0, limit - used),
  resetsAt: minsLeft === null ? null : new Date(Date.now() + minsLeft * 60_000).toISOString(),
});

async function app({ pro = true, search = quota(35, 9), ask = quota(40, 12), peeks = null } = {}) {
  const c = await b.newContext({ viewport: { width: 400, height: 1100 } });
  const page = await c.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  // Catch-all first: Playwright matches handlers in reverse registration order.
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(pro ? [{ plan: "pro", expires_at: null }] : []) }));
  for (const [re, q, name] of [[/\/functions\/v1\/product-search/, search, "search"],
                               [/\/functions\/v1\/ai-assistant/, ask, "ask"]]) {
    await page.route(re, (r) => {
      peeks?.push([name, r.request().postData()]);
      if (q === "error") return r.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ quota: q }) });
    });
  }

  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  await page.evaluate((uid) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "tester", onboarded: true,
      theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
  }, UID);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
  await page.waitForTimeout(2200);
  return { c, page };
}
const body = (page) => page.locator("body").innerText();

// ── 1. both allowances are shown ───────────────────────────────────────
{
  console.log("\n1. Searches and assistant questions both appear");
  const peeks = [];
  const { c, page } = await app({ peeks });
  const t = await body(page);
  ok("the searches row", /Product searches/i.test(t));
  ok("with the server's numbers", /26 of 35 left/.test(t), t.match(/.{0,30}of 35.{0,10}/)?.[0]);
  ok("the assistant row", /Assistant questions/i.test(t));
  ok("with its own numbers", /28 of 40 left/.test(t), t.match(/.{0,30}of 40.{0,10}/)?.[0]);
  ok("each says what was used", (t.match(/You've used \d+ this hour/g) || []).length === 2,
     JSON.stringify(t.match(/You've used \d+ this hour/g)));
  ok("and when it resets", (t.match(/Resets at /g) || []).length === 2);

  /* Both are read with a peek, which the server answers without spending
     any of the allowance. If this ever became an ordinary request, opening
     Settings would quietly cost people their quota. */
  ok("both were read with peek", peeks.length === 2 && peeks.every(([, b]) => /"peek":true/.test(b || "")),
     JSON.stringify(peeks));
}

// ── 2. a free account is shown nothing ─────────────────────────────────
{
  console.log("\n2. A free account has no allowances to show");
  const peeks = [];
  const { c, page } = await app({ pro: false, peeks });
  const t = await body(page);
  ok("no usage panel", !/Product searches|Assistant questions/i.test(t));
  ok("and nothing was even asked", peeks.length === 0, JSON.stringify(peeks));
  await c.close();
}

// ── 3. one endpoint failing costs only its own row ─────────────────────
{
  console.log("\n3. A failure loses one row, not both");
  const { c, page } = await app({ ask: "error" });
  const t = await body(page);
  ok("searches still shown", /Product searches/i.test(t));
  ok("assistant row omitted rather than guessed", !/Assistant questions/i.test(t));
  await c.close();
}

// ── 4. an exhausted allowance says so ──────────────────────────────────
{
  console.log("\n4. Running out is stated plainly");
  const { c, page } = await app({ search: quota(35, 35), ask: quota(40, 3) });
  const t = await body(page);
  ok("zero left is shown", /0 of 35 left/.test(t), t.match(/.{0,20}of 35.{0,10}/)?.[0]);
  ok("and named", /used this hour's searches/i.test(t), t.match(/.{0,50}this hour's.{0,20}/)?.[0]);
  ok("the other is unaffected", /37 of 40 left/.test(t));
  await c.close();
}

// ── 5. an untouched allowance is not given a reset time ────────────────
{
  console.log("\n5. A full allowance has no reset pending");
  const { c, page } = await app({ search: quota(35, 0, null), ask: quota(40, 0, null) });
  const t = await body(page);
  ok("no reset time invented", !/Resets at /.test(t));
  ok("it says the allowance is whole", (t.match(/full allowance is available/g) || []).length === 2);
  await c.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
