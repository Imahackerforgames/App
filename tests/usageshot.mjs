/* Settings → Usage, captured to a PNG with realistic numbers.

   Diagnostic, like billingshot: it asserts nothing, it just shows what got
   built so the panel can be looked at rather than described. tests/usage.mjs
   is the one that asserts.

   The numbers below are the real limits — 30 per 3 hours for each, 150 and
   250 a month — with a plausible amount spent, so the screenshot shows what
   a working account actually sees rather than a full or empty meter. */
import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const quota = (limit, used, minsLeft, month) => ({
  limit, used, remaining: Math.max(0, limit - used),
  resetsAt: new Date(Date.now() + minsLeft * 60_000).toISOString(),
  month,
});
const monthly = (limit, used, days) => ({
  limit, used, remaining: Math.max(0, limit - used),
  resetsAt: new Date(Date.now() + days * 86400_000).toISOString(),
});

await page.route("**://*.supabase.co/**", (r) => r.abort());
await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify([{ plan: "pro", expires_at: "2026-10-30T23:27:38Z" }]),
}));
await page.route(/\/functions\/v1\/product-search/, (r) => r.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ quota: quota(30, 11, 96, monthly(150, 38, 21)) }),
}));
await page.route(/\/functions\/v1\/ai-assistant/, (r) => r.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ quota: quota(30, 7, 96, monthly(250, 64, 21)) }),
}));

const UID = "u1";
await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await page.evaluate((uid) => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "member@example.com", provider: "email",
    token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "member", onboarded: true,
    name: "Member", state: "Georgia", zip: "30106", theme: "obsidian" }));
}, UID);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1600);

await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
await page.waitForTimeout(2200);

const usage = page.locator("text=Usage").first();
await usage.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

/* The panel on its own, cropped to the card, so it can be read at a glance
   rather than hunted for in a full-page shot. */
const card = page.locator("text=Product searches").locator("xpath=ancestor::*[self::div][3]").first();
await card.screenshot({ path: "/home/user/App/usage-panel.png" }).catch(async () => {
  await page.screenshot({ path: "/home/user/App/usage-panel.png" });
});
console.log("wrote usage-panel.png");

await page.screenshot({ path: "/home/user/App/usage-settings.png" });
console.log("wrote usage-settings.png");

await b.close();
