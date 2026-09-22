import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const KEYS = ["ivory", "pearl", "obsidian", "emerald"];

for (const key of KEYS) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.addInitScript((k) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@e.com", provider: "email", token: "t", id: "u1" }));
    localStorage.setItem("ros:profile", JSON.stringify({ username: "tester", onboarded: true, theme: k, state: "CA", zip: "90001", radius: 25 }));
  }, key);
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const v = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".reseller-root"));
    const g = (n) => cs.getPropertyValue(n).trim();
    return { void: g("--c-void"), accent: g("--c-accent"), onAccent: g("--c-onAccent"), bone: g("--c-bone") };
  });
  ok(`${key}: theme variables applied`, !!v.void && !!v.onAccent, JSON.stringify(v));

  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  const body = await page.locator("body").innerText();
  ok(`${key}: all four themes offered`,
     ["Luxury Ivory", "Pearl Blue", "Obsidian Gold", "Midnight Emerald"].every((n) => body.includes(n)));
  ok(`${key}: no old theme names left`,
     !/\b(Wealth|Heat|Ice|Night|Clean)\b/.test(body), body.match(/\b(Wealth|Heat|Ice|Night|Clean)\b/)?.[0] || "");
  await page.screenshot({ path: `shot-theme-${key}.png` });
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
