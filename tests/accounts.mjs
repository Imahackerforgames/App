/* One browser, several accounts.

   The bug this covers: every stored key was `ros:inventory`, `ros:sales`
   and so on with no account attached, and sign-out cleared only the session.
   So one browser held one set of data and every account that signed in saw
   it — on a shared computer, two people reading each other's finances. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const session = (id, email) => JSON.stringify({
  email, provider: "email", token: "t", id, refresh: "r",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});
const stock = (title) => JSON.stringify([{ id: "i1", title, units: 1, unitsLeft: 1, cost: 20,
  addedAt: new Date().toISOString(), notes: "", soldOutAt: null }]);

async function ctx() {
  const c = await b.newContext({ viewport: { width: 400, height: 880 } });
  const page = await c.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  return { c, page };
}
const PROFILE = JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 });

/* The profile is scoped per account like everything else, so each account
   needs its own or it lands on onboarding instead of the app. `onboard:false`
   is for the legacy test, where the unscoped profile is the thing being
   inherited. */
const asUser = async (page, id, email, { onboard = true, extra = {} } = {}) => {
  await page.evaluate(([s, id_, prof, ex]) => {
    localStorage.setItem("ros:session", s);
    if (prof) localStorage.setItem(`ros:u:${id_}:profile`, prof);
    for (const [k, v] of Object.entries(ex)) localStorage.setItem(k, v);
  }, [session(id, email), id, onboard ? PROFILE : null, extra]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
};
const openBusiness = async (page) => {
  await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
  await page.waitForTimeout(900);
  return page.locator("body").innerText();
};

// ── 1. a second account does not see the first one's data ──────────────
{
  console.log("\n1. Two accounts on one browser stay separate");
  const { c, page } = await ctx();
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });

  await asUser(page, "user-aaa", "alice@example.com");
  await page.evaluate((inv) => localStorage.setItem("ros:u:user-aaa:inventory", inv), stock("Alice Widget"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  ok("account A sees its own stock", /Alice Widget/.test(await openBusiness(page)));

  await asUser(page, "user-bbb", "bob@example.com");
  const bobSees = await openBusiness(page);
  ok("account B does NOT see account A's stock", !/Alice Widget/.test(bobSees),
     bobSees.match(/.{0,60}Widget.{0,30}/)?.[0]);

  // B adds its own
  await page.evaluate((inv) => localStorage.setItem("ros:u:user-bbb:inventory", inv), stock("Bob Widget"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const bobOwn = await openBusiness(page);
  ok("account B sees its own", /Bob Widget/.test(bobOwn));
  ok("and still not A's", !/Alice Widget/.test(bobOwn));

  // back to A
  await asUser(page, "user-aaa", "alice@example.com");
  const aliceAgain = await openBusiness(page);
  ok("account A's data survived the switch", /Alice Widget/.test(aliceAgain));
  ok("and A cannot see B's", !/Bob Widget/.test(aliceAgain));
  await c.close();
}

// ── 2. signing out takes the data off the screen ───────────────────────
{
  console.log("\n2. Signing out clears what's on screen");
  const { c, page } = await ctx();
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await asUser(page, "user-ccc", "carol@example.com");
  await page.evaluate((inv) => localStorage.setItem("ros:u:user-ccc:inventory", inv), stock("Carol Widget"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  ok("signed in and sees stock", /Carol Widget/.test(await openBusiness(page)));

  await page.getByRole("button", { name: /Sign out/i }).click({ force: true });
  await page.waitForTimeout(1200);
  const after = await page.locator("body").innerText();
  ok("back at the login screen", /Log in|Sign up/i.test(after));
  ok("no stock left on screen", !/Carol Widget/.test(after), after.slice(0, 120));
  ok("but it is not deleted — still stored for that account",
     !!(await page.evaluate(() => localStorage.getItem("ros:u:user-ccc:inventory"))));
  await c.close();
}

// ── 3. old unscoped data goes to one account, not everyone ─────────────
{
  console.log("\n3. Data from before the fix is claimed once");
  const { c, page } = await ctx();
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  // Seed the pre-fix shape: unscoped keys.
  await page.evaluate((inv) => {
    localStorage.setItem("ros:inventory", inv);
    localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
  }, stock("Legacy Widget"));

  await asUser(page, "user-ddd", "dave@example.com", { onboard: false });
  ok("the first account to sign in inherits it", /Legacy Widget/.test(await openBusiness(page)));
  ok("and the unscoped copy is gone",
     !(await page.evaluate(() => localStorage.getItem("ros:inventory"))));
  ok("it now belongs to that account",
     !!(await page.evaluate(() => localStorage.getItem("ros:u:user-ddd:inventory"))));

  await asUser(page, "user-eee", "erin@example.com");
  const erin = await openBusiness(page);
  ok("a second account does NOT also inherit it", !/Legacy Widget/.test(erin),
     erin.match(/.{0,60}Legacy.{0,30}/)?.[0]);
  await c.close();
}

// ── 4. nothing is written while signed out ─────────────────────────────
{
  console.log("\n4. Signed out, nothing is written anywhere");
  const { c, page } = await ctx();
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ros:")));
  ok("no data keys created by simply visiting",
     !keys.some((k) => /inventory|sales|watchlist/.test(k)), JSON.stringify(keys));
  await c.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
