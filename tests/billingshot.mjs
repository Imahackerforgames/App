/* Settings → Billing as a premium member sees it, captured to a PNG.

   Diagnostic, like zoomaudit: it proves nothing on its own, it just shows
   what got built. tests/billing.mjs is the one that asserts. */
import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.route("**://*.supabase.co/**", (r) => r.abort());
await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
/* Registered last so it matches first — Playwright tries routes in reverse
   registration order. */
await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify([{ plan: "pro", expires_at: "2026-10-30T23:27:38Z" }]),
}));

const UID = "u1";
await page.addInitScript((uid) => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "member@example.com", provider: "email",
    token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "member", onboarded: true,
    name: "Member", state: "Georgia", zip: "30106", theme: "obsidian" }));
}, UID);

await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.getByRole("button", { name: /settings/i }).last().click();
await page.waitForTimeout(900);

const billing = page.locator("text=Billing").first();
await billing.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/user/App/billing-premium.png" });
console.log("wrote billing-premium.png");

/* And the message a comped account gets, where there is no subscription to
   manage. 404 + no_subscription is the endpoint's own answer for that. */
await page.route(/\/functions\/v1\/billing-portal/, (r) => r.fulfill({
  status: 404, contentType: "application/json", body: JSON.stringify({ error: "no_subscription" }),
}));
await page.getByRole("button", { name: /manage subscription/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/home/user/App/billing-comped.png" });
console.log("wrote billing-comped.png");

await b.close();
