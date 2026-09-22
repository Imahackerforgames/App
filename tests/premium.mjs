import { chromium } from "playwright";

const BASE = "http://localhost:4173/";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Signs in and lands in the app with the given plan, by answering the
   entitlements lookup the way the server would. */
async function appAs(plan) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify(plan === "pro" ? [{ plan: "pro", expires_at: null }] : []),
  }));
  await page.addInitScript(() => {
    localStorage.setItem("ros:session", JSON.stringify(
      { email: "t@example.com", provider: "email", token: "tok", id: "u1" }));
    // Skip onboarding so we land straight on the tabs.
    localStorage.setItem("ros:profile", JSON.stringify(
      { username: "tester", onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  // Onboarding may still show on a fresh store; get past it if so.
  if (await page.getByText("Where are you located?").count()) {
    await page.selectOption('select[aria-label="State"]', "California").catch(async () => {
      await page.selectOption('select[aria-label="State"]', { index: 1 });
    });
    await page.getByRole("button", { name: /Show me opportunities/ }).click();
    await page.waitForTimeout(500);
  }
  return { ctx, page };
}

/* Only the upgrade dialog is aria-modal; the assistant sheet and the
   bottom sheets are role="dialog" too, so a bare role lookup matches them
   as well and reports an upsell that isn't there. */
const upgradeDialog = (page) => page.locator('[role="dialog"][aria-modal="true"]');
const modalUp = (page) => upgradeDialog(page).isVisible().catch(() => false);
const onTab = async (page, name) =>
  (await page.getByRole("button", { name: new RegExp(`^${name}$`) }).getAttribute("aria-current")) === "page";

// ───────────────────────────────── free account
{
  console.log("\nFree account");
  const { ctx, page } = await appAs("free");

  ok("starts on Home", await onTab(page, "Home"));

  // The Discover tab opens; AI Discover and Product Search inside it are locked.
  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(400);
  ok("the Discover tab opens for free accounts", await onTab(page, "Discover"));
  ok("no dialog on arrival", !(await modalUp(page)));
  ok("it lands on Saved, the one free chip",
     (await page.getByRole("button", { name: /^Saved$/ }).count()) > 0 &&
     (await page.getByPlaceholder(/Jordan 4 Black Cat, PS5/i).count()) === 0);

  await page.getByRole("button", { name: /AI Discover/ }).click();
  await page.waitForTimeout(350);
  ok("tapping AI Discover raises the dialog", await modalUp(page));
  ok("the dialog explains AI Discover", /AI Discover is premium/.test(await upgradeDialog(page).innerText()));
  await page.getByRole("button", { name: /Maybe later/ }).click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: /Product Search/ }).click();
  await page.waitForTimeout(350);
  ok("tapping Product Search raises the dialog", await modalUp(page));
  ok("the dialog explains Product Search",
     /Product Search is premium/.test(await upgradeDialog(page).innerText()));

  await page.getByRole("button", { name: /Maybe later/ }).click();
  await page.waitForTimeout(250);
  ok("Maybe later closes it", !(await modalUp(page)));
  ok("the search box is never reachable",
     (await page.getByPlaceholder(/Jordan 4 Black Cat, PS5/i).count()) === 0);

  await page.getByRole("button", { name: /Product Search/ }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  ok("Escape closes it", !(await modalUp(page)));

  // Saved is the free one
  await page.getByRole("button", { name: /^Saved$/ }).click();
  await page.waitForTimeout(300);
  ok("Saved stays free", !(await modalUp(page)));

  // Saturation, Business, Settings, Home stay open
  for (const t of ["Saturation", "Business", "Settings", "Home"]) {
    await page.getByRole("button", { name: new RegExp(`^${t}$`) }).click();
    await page.waitForTimeout(300);
    ok(`${t} is open to free accounts`, await onTab(page, t) && !(await modalUp(page)));
  }

  // Listing inside Business is locked
  await page.getByRole("button", { name: /^Business$/ }).click();
  await page.waitForTimeout(300);
  ok("Business opens on Inventory", (await page.getByText(/Inventory/i).count()) > 0);
  await page.getByRole("button", { name: /^Listing$/ }).click();
  await page.waitForTimeout(350);
  ok("tapping Listing raises the dialog", await modalUp(page));
  ok("the dialog explains the listing writer",
     /listing writer is premium/i.test(await upgradeDialog(page).innerText()));
  await page.getByRole("button", { name: /Maybe later/ }).click();
  await page.waitForTimeout(250);
  ok("the listing form is not reachable",
     (await page.getByPlaceholder(/Jordan 4 Black Cat/).count()) === 0);

  // Calculator and Essentials still free
  await page.getByRole("button", { name: /^Calculator$/ }).click();
  await page.waitForTimeout(300);
  ok("Calculator stays free", !(await modalUp(page)));

  // the AI button
  await page.getByRole("button", { name: /Open AI assistant/ }).click();
  await page.waitForTimeout(350);
  ok("tapping the AI button raises the dialog", await modalUp(page));
  ok("the dialog explains the assistant",
     /assistant is premium/i.test(await upgradeDialog(page).innerText()));
  await page.getByRole("button", { name: /Maybe later/ }).click();
  await page.waitForTimeout(250);
  ok("the chat box never opens", (await page.getByPlaceholder(/Ask/i).count()) === 0);

  // every dialog offers the upgrade
  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /AI Discover/ }).click();
  await page.waitForTimeout(350);
  ok("the dialog offers Upgrade to premium",
     await page.getByRole("button", { name: /Upgrade to premium/ }).isVisible());
  await ctx.close();
}

// ───────────────────────────────── premium account
{
  console.log("\nPremium account");
  const { ctx, page } = await appAs("pro");

  for (const t of ["Discover", "Saturation", "Business", "Settings", "Home"]) {
    await page.getByRole("button", { name: new RegExp(`^${t}$`) }).click();
    await page.waitForTimeout(350);
    ok(`${t} opens, no dialog`, await onTab(page, t) && !(await modalUp(page)));
  }

  await page.getByRole("button", { name: /^Discover$/ }).click();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /AI Discover/ }).click();
  await page.waitForTimeout(400);
  ok("AI Discover opens for premium", !(await modalUp(page)));
  await page.getByRole("button", { name: /Product Search/ }).click();
  await page.waitForTimeout(350);
  ok("Product Search opens for premium", !(await modalUp(page)));
  ok("and its search box is there for premium",
     (await page.getByPlaceholder(/Jordan 4 Black Cat, PS5/i).count()) > 0);

  await page.getByRole("button", { name: /^Business$/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Listing$/ }).click();
  await page.waitForTimeout(350);
  ok("Listing opens for premium", !(await modalUp(page)));
  ok("the listing form is there", (await page.getByPlaceholder(/Jordan 4 Black Cat/).count()) > 0);

  await page.getByRole("button", { name: /Open AI assistant/ }).click();
  await page.waitForTimeout(450);
  ok("the assistant opens for premium", !(await modalUp(page)));

  // Settings reports the plan. Close the assistant by its own button —
  // its backdrop covers the tab row while it is open.
  await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  ok("Settings says Premium", /Premium/.test(await page.locator("body").innerText()));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
