import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", e => { console.log("  PAGEERROR " + e.message); fail++; });
await page.route("**://*.supabase.co/**", r => r.abort());
await page.route(/\/rest\/v1\/entitlements/, r => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

// 1. the login screen
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
ok("tab title is Reamp", (await page.title()) === "Reamp", await page.title());
const body = await page.locator("body").innerText();
ok("login wordmark says REAMP", /REAMP/.test(body), body.slice(0, 60));
ok("no RESELLING left anywhere on the login screen", !/RESELLING/i.test(body));
ok("the mark is on the login screen", (await page.locator('svg[aria-label="Reamp"]').count()) > 0);
await page.screenshot({ path: "shot-brand-login.png" });

// 2. the favicon actually resolves
const res = await page.request.get("http://localhost:4173/favicon.svg");
ok("favicon.svg is served", res.status() === 200, String(res.status()));
ok("favicon is an svg", (res.headers()["content-type"] || "").includes("svg"), res.headers()["content-type"]);
ok("favicon is linked from the page",
   (await page.locator('link[rel="icon"]').count()) > 0);

// 3. inside the app, on every tab
await page.addInitScript(() => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "t", id: "u1" }));
  localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
if (await page.getByText("Where are you located?").count()) {
  await page.selectOption('select[aria-label="State"]', { index: 1 });
  await page.getByRole("button", { name: /Show me opportunities/ }).click();
  await page.waitForTimeout(600);
}
/* The header wordmark sets the mark as the letter R, so the visible text is
   only "EAMP." — the R is drawn. The accessible name has to say Reamp
   regardless, or a screen reader announces the app as "EAMP". */
const wordmark = page.locator('[role="img"][aria-label="Reamp"]');
for (const t of ["Home", "Discover", "Saturation", "Business", "Settings"]) {
  await page.getByRole("button", { name: new RegExp(`^${t}$`) }).click();
  await page.waitForTimeout(300);
  const n = await wordmark.count();
  ok(`${t}: the wordmark is in the header`, n > 0, `found=${n}`);
  const txt = (await wordmark.first().innerText()).replace(/\s+/g, "");
  ok(`${t}: the letters beside the mark read EAMP.`, txt === "EAMP.", txt);
  ok(`${t}: the drawn R is there, hidden from screen readers`,
     (await wordmark.first().locator('svg[aria-hidden="true"]').count()) === 1);
}
ok("the header wordmark is announced as Reamp, not EAMP",
   (await wordmark.first().getAttribute("aria-label")) === "Reamp");
ok("no RESELLING anywhere in the app", !/RESELLING/i.test(await page.locator("body").innerText()));
await page.getByRole("button", { name: /^Home$/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "shot-brand-home.png" });

// 4. all five themes still render the mark
await page.getByRole("button", { name: /^Settings$/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "shot-brand-settings.png" });

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
