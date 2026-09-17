import { chromium } from "playwright";
const EXPECT = "https://commas.com/checkout/Kk21xLu7i0siFBoV";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
const page = await ctx.newPage();
await page.route("**://*.supabase.co/**", r => r.abort());
await page.route(/\/rest\/v1\/entitlements/, r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await page.addInitScript(() => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "t", id: "u1" }));
  localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
});

// Catch the new tab rather than letting it navigate to the real checkout.
const opened = [];
ctx.on("page", (p) => opened.push(p.url()));
await page.addInitScript(() => {
  window.__opened = [];
  window.open = (u) => { window.__opened.push(u); return { closed: false }; };
});

await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
if (await page.getByText("Where are you located?").count()) {
  await page.selectOption('select[aria-label="State"]', { index: 1 });
  await page.getByRole("button", { name: /Show me opportunities/ }).click();
  await page.waitForTimeout(600);
}

// 1. from the AI Discover popup
await page.getByRole("button", { name: /^Discover$/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /AI Discover/ }).click();
await page.waitForTimeout(350);
await page.getByRole("button", { name: /Upgrade to premium/ }).click();
await page.waitForTimeout(300);
let urls = await page.evaluate(() => window.__opened);
ok("AI Discover popup opens the checkout", urls.at(-1) === EXPECT, String(urls.at(-1)));

// 2. from the Listing popup
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^Business$/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /^Listing$/ }).click();
await page.waitForTimeout(350);
await page.getByRole("button", { name: /Upgrade to premium/ }).click();
await page.waitForTimeout(300);
urls = await page.evaluate(() => window.__opened);
ok("Listing popup opens the checkout", urls.at(-1) === EXPECT, String(urls.at(-1)));

// 3. from the assistant popup
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /Open AI assistant/ }).click();
await page.waitForTimeout(350);
await page.getByRole("button", { name: /Upgrade to premium/ }).click();
await page.waitForTimeout(300);
urls = await page.evaluate(() => window.__opened);
ok("assistant popup opens the checkout", urls.at(-1) === EXPECT, String(urls.at(-1)));

// 4. from Settings
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^Settings$/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Upgrade to premium/ }).first().click();
await page.waitForTimeout(300);
urls = await page.evaluate(() => window.__opened);
ok("Settings button opens the checkout", urls.at(-1) === EXPECT, String(urls.at(-1)));

ok("no stale link anywhere", urls.every((u) => u === EXPECT), JSON.stringify(urls));
ok("all four entry points fired", urls.length === 4, String(urls.length));

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
