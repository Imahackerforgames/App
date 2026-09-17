import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function walk(ctxOpts) {
  const ctx = await b.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", r => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ plan: "pro", expires_at: null }]) }));
  await page.addInitScript(() => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "t", id: "u1" }));
    localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  if (await page.getByText("Where are you located?").count()) {
    await page.selectOption('select[aria-label="State"]', { index: 1 });
    await page.getByRole("button", { name: /Show me opportunities/ }).click();
    await page.waitForTimeout(600);
  }
  return { ctx, page };
}

const smallest = (page) => page.evaluate(() => {
  let min = Infinity;
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (["range", "checkbox", "radio"].includes(el.type)) continue;
    min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
  }
  return min === Infinity ? null : min;
});

const overflow = (page) => page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));

// ── phone ──────────────────────────────────────────────────────────────
console.log("\niPhone 390px");
{
  const { ctx, page } = await walk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  for (const tab of ["Home", "Discover", "Saturation", "Business", "Settings"]) {
    await page.getByRole("button", { name: new RegExp(`^${tab}$`) }).click();
    await page.waitForTimeout(350);
    const o = await overflow(page);
    ok(`${tab}: no sideways scroll`, o.doc <= o.win + 1, `page ${o.doc} > window ${o.win}`);
  }
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  const m = await smallest(page);
  ok(`fields are at least 16px on touch (smallest ${m})`, m >= 16, String(m));
  await ctx.close();
}

// ── small phone ────────────────────────────────────────────────────────
console.log("\niPhone SE 320px");
{
  const { ctx, page } = await walk({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const tab of ["Home", "Discover", "Saturation", "Business", "Settings"]) {
    await page.getByRole("button", { name: new RegExp(`^${tab}$`) }).click();
    await page.waitForTimeout(350);
    const o = await overflow(page);
    ok(`${tab}: no sideways scroll`, o.doc <= o.win + 1, `page ${o.doc} > window ${o.win}`);
  }
  await ctx.close();
}

// ── desktop, which must be untouched ───────────────────────────────────
console.log("\nDesktop 1280px (sizes must NOT have changed)");
{
  const { ctx, page } = await walk({ viewport: { width: 1280, height: 900 } });
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  const m = await smallest(page);
  ok(`desktop fields keep their designed size (${m}px, not 16)`, m < 16, String(m));
  const o = await overflow(page);
  ok("no sideways scroll", o.doc <= o.win + 1, `page ${o.doc} > window ${o.win}`);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
