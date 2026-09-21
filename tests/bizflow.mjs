/* The money flow: add a product, log a sale, check the numbers.

   Never covered before. Two bugs came out of writing it — a blank date
   threw RangeError out of an unguarded toISOString() and silently lost the
   product, and every Field label was a div rather than a <label>, so screen
   readers announced unlabelled boxes throughout Add product, Log a sale and
   Settings. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function app({ inventory = null } = {}) {
  /* Deliberately not UTC. Date bugs of the "a day early" kind are invisible
     at zero offset — local midnight and UTC midnight are the same instant —
     so a UTC test browser would pass while every real user west of Greenwich
     saw the wrong day. */
  const ctx = await b.newContext({ viewport: { width: 400, height: 880 }, timezoneId: "America/Los_Angeles" });
  const page = await ctx.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ plan: "pro", expires_at: null }]) }));
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.addInitScript((inv) => {
    localStorage.setItem("ros:session", JSON.stringify({ email:"t@e.com", provider:"email", token:"t", id:"u1", refresh:"r", expiresAt: Math.floor(Date.now()/1000)+3600 }));
    localStorage.setItem("ros:profile", JSON.stringify({ username: "tester", onboarded: true, theme:"obsidian", state:"CA", zip:"90001", radius:25 }));
    if (inv) localStorage.setItem("ros:inventory", inv);
  }, inventory);
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
  await page.waitForTimeout(800);
  return { ctx, page, crashes };
}

// ── 1. adding a product works and the totals follow ────────────────────
{
  console.log("\n1. Add a product");
  const { ctx, page, crashes } = await app();
  await page.getByRole("button", { name: /Add product|Add a product/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  const f = page.locator(".fld");
  await f.nth(0).fill("Test Widget");
  await f.nth(1).fill("3");
  await f.nth(2).fill("20");
  await page.waitForTimeout(300);
  const add = page.getByRole("button", { name: /Add to inventory/i });
  ok("the button enables once it has what it needs", !(await add.isDisabled()));
  await add.click({ force: true });
  await page.waitForTimeout(900);

  const inv = JSON.parse(await page.evaluate(() => localStorage.getItem("ros:u:u1:inventory")) || "[]");
  ok("it saved", inv.length === 1, JSON.stringify(inv));
  ok("with the right numbers", inv[0]?.units === 3 && inv[0]?.cost === 20, JSON.stringify(inv[0]));
  ok("and a usable date", !Number.isNaN(new Date(inv[0]?.addedAt).getTime()), String(inv[0]?.addedAt));
  ok("it appears in the list", /Test Widget/.test(await page.locator("body").innerText()));

  await page.getByRole("button", { name: /^Home$/ }).click({ force: true });
  await page.waitForTimeout(900);
  const home = await page.locator("body").innerText();
  ok("Total spent is 3 x $20", /\$60/.test(home), home.match(/.{0,30}Total spent.{0,30}/s)?.[0]);
  ok("no crashes", crashes.length === 0, crashes.join(" | "));
  await ctx.close();
}

// ── 2. a blank date must not throw the sheet away ──────────────────────
{
  console.log("\n2. A cleared date doesn't silently eat the product");
  const { ctx, page, crashes } = await app();
  await page.getByRole("button", { name: /Add product|Add a product/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  const f = page.locator(".fld");
  await f.nth(0).fill("Crash Test");
  await f.nth(1).fill("1");
  await f.nth(2).fill("10");
  await page.locator('input[type="date"]').first().fill("");
  await page.waitForTimeout(400);

  const add = page.getByRole("button", { name: /Add to inventory/i });
  ok("the button refuses rather than throwing", await add.isDisabled());
  await add.click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  ok("nothing was thrown", !crashes.some((c) => /Invalid time value/i.test(c)), crashes.join(" | "));
  ok("the sheet is still there", /Add product/i.test(await page.locator("body").innerText()));

  // and it recovers once a date is back
  await page.locator('input[type="date"]').first().fill("2026-09-01");
  await page.waitForTimeout(400);
  ok("and works again once the date is valid", !(await add.isDisabled()));
  await ctx.close();
}

// ── 3. every field is announced to a screen reader ─────────────────────
{
  console.log("\n3. Form fields are labelled, not just visually captioned");
  const { ctx, page } = await app();
  await page.getByRole("button", { name: /Add product|Add a product/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  for (const name of ["What is it?", "How many?", "Cost per unit", "Purchase date"]) {
    ok(`"${name}" resolves by label`, (await page.getByLabel(name, { exact: true }).count()) === 1);
  }
  await ctx.close();
}

// ── 4. logging a sale ──────────────────────────────────────────────────
{
  console.log("\n4. Log a sale against stock");
  const inv = JSON.stringify([{ id:"i1", title:"Test Widget", units:3, unitsLeft:3, cost:20,
    addedAt:new Date().toISOString(), purchaseDate:new Date().toISOString(), notes:"", soldOutAt:null }]);
  const { ctx, page, crashes } = await app({ inventory: inv });
  await page.getByRole("button", { name: /^Log a sale$/ }).first().click({ force: true });
  await page.waitForTimeout(800);
  ok("it asks how it sold first", /meetup|shipp/i.test(await page.locator("body").innerText()));
  await page.getByRole("button", { name: /Shipp/i }).first().click({ force: true });
  await page.waitForTimeout(700);

  const qty = page.getByLabel(/Quantity/i).first();
  const amount = page.getByLabel(/Sale amount/i).first();
  ok("quantity and amount are both labelled", (await qty.count()) === 1 && (await amount.count()) === 1);
  await amount.fill("60");
  await page.waitForTimeout(400);
  const log = page.getByRole("button", { name: /^Log sale$/ });
  ok("it can be logged", !(await log.isDisabled()));
  await log.click({ force: true });
  await page.waitForTimeout(900);
  const sales = JSON.parse(await page.evaluate(() => localStorage.getItem("ros:u:u1:sales")) || "[]");
  ok("the sale saved", sales.length === 1, JSON.stringify(sales));
  ok("no crashes", crashes.length === 0, crashes.join(" | "));
  await ctx.close();
}

// ── 5. more than you own is refused ────────────────────────────────────
{
  console.log("\n5. Selling more units than you have is refused");
  const inv = JSON.stringify([{ id:"i1", title:"Test Widget", units:3, unitsLeft:3, cost:20,
    addedAt:new Date().toISOString(), notes:"", soldOutAt:null }]);
  const { ctx, page } = await app({ inventory: inv });
  await page.getByRole("button", { name: /^Log a sale$/ }).first().click({ force: true });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Shipp/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.getByLabel(/Quantity/i).first().fill("60");
  await page.getByLabel(/Sale amount/i).first().fill("60");
  await page.waitForTimeout(400);
  ok("the log button stays refused", await page.getByRole("button", { name: /^Log sale$/ }).isDisabled());
  await ctx.close();
}

// ── 6. the date you pick is the date you get ───────────────────────────
{
  console.log("\n6. Dates are not a day early");
  /* The old code did `new Date("2026-09-19")`, which is midnight UTC — still
     the 18th anywhere west of Greenwich. Every stored date was a day out. */
  const { ctx, page, crashes } = await app();
  await page.getByRole("button", { name: /Add product|Add a product/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  const f = page.locator(".fld");
  await f.nth(0).fill("Date Test");
  await f.nth(1).fill("1");
  await f.nth(2).fill("10");
  await page.locator('input[type="date"]').first().fill("2026-09-19");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Add to inventory/i }).click({ force: true });
  await page.waitForTimeout(1000);

  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("ros:u:u1:inventory")) || "[]");
  const back = new Date(saved[0]?.addedAt);
  ok("stored at all", saved.length === 1, JSON.stringify(saved));
  ok("reads back as the 19th locally, not the 18th",
     back.getFullYear() === 2026 && back.getMonth() === 8 && back.getDate() === 19,
     `${saved[0]?.addedAt} -> ${back.toDateString()}`);
  ok("and not stored at midnight UTC, which is the bug's fingerprint",
     !/T00:00:00\.000Z$/.test(saved[0]?.addedAt || ""), String(saved[0]?.addedAt));
  ok("no crashes", crashes.length === 0, crashes.join(" | "));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
