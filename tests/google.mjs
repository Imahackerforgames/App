import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
await page.route("**://*.supabase.co/**", (r) => r.abort());
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

for (const [label, tab] of [["Log in", "Log in"], ["Sign up", "Sign up"]]) {
  await page.getByRole("button", { name: tab, exact: true }).first().click();
  await page.waitForTimeout(250);
  ok(`${label}: no Google button`, (await page.getByRole("button", { name: /Continue with Google/ }).count()) === 0);
  const body = await page.locator("body").innerText();
  ok(`${label}: no leftover OR divider`, !/\bOR\b/.test(body), body.slice(0, 160));
  ok(`${label}: no popup instructions`, !/Opens a popup/i.test(body));
  ok(`${label}: no Google footnote`, !/Google needs your deployed domain/i.test(body));
  ok(`${label}: email sign-in still there`,
     (await page.getByPlaceholder(/you@email\.com/).count()) > 0);
}

// The reset screens must be untouched by this.
await page.getByRole("button", { name: "Log in", exact: true }).first().click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Forgot?" }).click();
await page.waitForTimeout(300);
ok("forgot-password screen still works", await page.getByText("Reset your password").isVisible());

await page.screenshot({ path: "shot-nogoogle.png" });
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
