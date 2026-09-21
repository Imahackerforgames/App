import { chromium } from "playwright";

/* iOS Safari zooms the page whenever a text field is focused whose computed
   font-size is under 16px. This walks the app on a phone viewport and lists
   every control that would trigger it. */

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.route("**://*.supabase.co/**", r => r.abort());
await page.route(/\/rest\/v1\/entitlements/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ plan: "pro", expires_at: null }]) }));

const audit = async (label) => {
  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (el.type === "range" || el.type === "checkbox" || el.type === "radio") continue;
      out.push({ tag: el.tagName.toLowerCase(), type: el.type || "", fs,
                 hint: el.placeholder || el.getAttribute("aria-label") || "" });
    }
    return out;
  });
  for (const r of rows) {
    const bad = r.fs < 16;
    console.log(`  ${bad ? "ZOOMS" : "ok   "}  ${String(r.fs).padStart(5)}px  ${label} — ${r.tag}${r.type ? "/" + r.type : ""}  "${r.hint}"`);
  }
  return rows.filter(r => r.fs < 16).length;
};

let bad = 0;
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
console.log("\nLogin screen");
bad += await audit("login");
await page.getByRole("button", { name: "Sign up", exact: true }).click();
await page.waitForTimeout(250);
console.log("\nSign up");
bad += await audit("signup");
await page.getByRole("button", { name: "Forgot?" }).click().catch(() => {});
await page.getByRole("button", { name: "Log in", exact: true }).first().click().catch(() => {});
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Forgot?" }).click();
await page.waitForTimeout(250);
console.log("\nForgot password");
bad += await audit("forgot");

// Into the app.
await page.addInitScript(() => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "t", id: "u1" }));
  localStorage.setItem("ros:profile", JSON.stringify({ username: "tester", onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
if (await page.getByText("Where are you located?").count()) {
  console.log("\nOnboarding");
  bad += await audit("onboard");
  await page.selectOption('select[aria-label="State"]', { index: 1 });
  await page.getByRole("button", { name: /Show me opportunities/ }).click();
  await page.waitForTimeout(600);
}

for (const [tab, sub] of [["Discover", "Product Search"], ["Business", "Calculator"], ["Business", "Listing"], ["Settings", null]]) {
  await page.getByRole("button", { name: new RegExp(`^${tab}$`) }).click();
  await page.waitForTimeout(350);
  if (sub) { await page.getByRole("button", { name: new RegExp(`^${sub}$`) }).click(); await page.waitForTimeout(350); }
  console.log(`\n${tab}${sub ? " / " + sub : ""}`);
  bad += await audit(`${tab}${sub ? "/" + sub : ""}`);
}

// Add-product sheet.
await page.getByRole("button", { name: /^Business$/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^Inventory$/ }).click();
await page.waitForTimeout(300);
const add = page.getByRole("button", { name: /Add a product|Add product/i }).first();
if (await add.count()) { await add.click(); await page.waitForTimeout(400); console.log("\nAdd product sheet"); bad += await audit("add sheet"); }

console.log(`\n${bad} control(s) would make iOS zoom.`);
await b.close();
process.exit(0);
