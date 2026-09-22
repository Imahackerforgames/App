/* Signing up in two steps: account first, username second.

   The old form asked for a username, an email and a password before an
   account existed. Three fields is where people leave, and a name chosen
   before you have seen the product is chosen badly. So sign-up now takes
   two things, and the username is asked for on the next screen.

   What these tests are really protecting is the gate: `profiles.username`
   being empty is the only thing that summons the picker. Get that wrong in
   the lenient direction and people sign in with no username; get it wrong
   in the strict direction and every returning customer is asked to choose
   one again, which is far worse. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const UID = "u-new";
const session = (extra = {}) => JSON.stringify({
  email: "newbie@example.com", provider: "email", token: "t", id: UID, refresh: "r",
  expiresAt: Math.floor(Date.now() / 1000) + 3600, ...extra,
});

/* `profileRow` is what the database is pretending to hold. null means no row
   came back, which is the state a brand new account is in. */
async function app({ signedIn = true, profileRow = null, cached = null, taken = null, patchFails = false } = {}) {
  const c = await b.newContext({ viewport: { width: 400, height: 880 } });
  const page = await c.newPage();
  const calls = [];
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/rest\/v1\/(inventory|sales|watchlist)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/rest\/v1\/profiles/, (r) => {
    const url = r.request().url(), method = r.request().method();
    if (method === "PATCH") {
      calls.push("patch:" + (r.request().postData() || ""));
      return patchFails
        ? r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505" }) })
        : r.fulfill({ status: 204, body: "" });
    }
    // The availability lookup carries a username filter; the profile load does not.
    if (/username=ilike/.test(url)) {
      calls.push("check");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(taken || []) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profileRow ? [profileRow] : []) });
  });

  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  if (signedIn) {
    await page.evaluate(([s, uid, prof]) => {
      localStorage.setItem("ros:session", s);
      if (prof) localStorage.setItem(`ros:u:${uid}:profile`, prof);
    }, [session(), UID, cached]);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  return { c, page, calls };
}

const DBROW = { id: UID, name: "", username: "existing", state: "CA", zip: "90001",
  radius: 25, theme: "obsidian", onboarded: true, settings: null };

// ── 1. sign-up asks for two things, not three ──────────────────────────
{
  console.log("\n1. The sign-up form is down to email and password");
  const { c, page } = await app({ signedIn: false });
  await page.getByRole("button", { name: /^Sign up$/ }).first().click();
  await page.waitForTimeout(600);
  const body = await page.locator("body").innerText();
  ok("no username field on sign-up", !/What should we call you/i.test(body));
  ok("no username label either", !/^USERNAME$/im.test(body), body.slice(0, 200));
  ok("email is still asked for", /email/i.test(body));
  ok("password is still asked for", /password/i.test(body));
  await c.close();
}

// ── 2. a new account is sent to the picker ─────────────────────────────
{
  console.log("\n2. A brand new account picks a username");
  const { c, page } = await app({ profileRow: null });
  const body = await page.locator("body").innerText();
  ok("the picker is shown", /Pick a username/i.test(body), body.slice(0, 120));
  ok("it explains what it is for", /sign in with it instead of your email/i.test(body));
  ok("and the rules are stated", /3.20 characters/i.test(body));
  ok("it comes before onboarding", !/Where are you located/i.test(body));
  await c.close();
}

// ── 3. it guesses from the email so most people just press go ──────────
{
  console.log("\n3. A suggestion is pre-filled");
  const { c, page } = await app({ profileRow: null });
  ok("prefilled from the email local part",
     (await page.getByLabel("Username").inputValue()) === "newbie");
  await c.close();
}

// ── 4. the rules are enforced before anything is sent ──────────────────
{
  console.log("\n4. Invalid names cannot be submitted");
  const { c, page } = await app({ profileRow: null });
  const field = page.getByLabel("Username");
  const go = page.getByRole("button", { name: /Continue/ });
  for (const [why, value] of [["too short", "ab"], ["illegal characters", "bad name!"], ["empty", ""]]) {
    await field.fill(value);
    await page.waitForTimeout(150);
    ok(`${why} keeps the button disabled`, await go.isDisabled(), value);
  }
  await field.fill("good_name-1");
  await page.waitForTimeout(150);
  ok("a legal name enables it", await go.isEnabled());
  await c.close();
}

// ── 5. a free name is saved and the app opens ──────────────────────────
{
  console.log("\n5. Choosing a free name gets you in");
  const { c, page, calls } = await app({ profileRow: null, taken: [] });
  await page.getByLabel("Username").fill("flipper");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForTimeout(1200);
  ok("availability was checked", calls.some((x) => x === "check"), calls.join(" | "));
  ok("the name was written", calls.some((x) => x.startsWith("patch:") && /flipper/.test(x)), calls.join(" | "));
  const body = await page.locator("body").innerText();
  ok("the picker is gone", !/Pick a username/i.test(body));
  ok("onboarding is next", /Where are you located/i.test(body), body.slice(0, 120));
  await c.close();
}

// ── 6. a taken name is refused, and nothing is written ─────────────────
{
  console.log("\n6. A taken name is refused");
  const { c, page, calls } = await app({ profileRow: null, taken: [{ id: "somebody-else" }] });
  await page.getByLabel("Username").fill("flipper");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForTimeout(900);
  const body = await page.locator("body").innerText();
  ok("it says so", /taken/i.test(body), body.slice(0, 200));
  ok("nothing was written", !calls.some((x) => x.startsWith("patch:")), calls.join(" | "));
  ok("you are still on the picker", /Pick a username/i.test(body));
  await c.close();
}

// ── 7. losing the race is reported, not swallowed ──────────────────────
{
  console.log("\n7. Someone taking it mid-save is handled");
  const { c, page } = await app({ profileRow: null, taken: [], patchFails: true });
  await page.getByLabel("Username").fill("flipper");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForTimeout(1000);
  const body = await page.locator("body").innerText();
  ok("the collision is explained", /just taken/i.test(body), body.slice(0, 200));
  ok("and you can try again", await page.getByRole("button", { name: /Continue/ }).isEnabled());
  await c.close();
}

// ── 8. the gate: nobody with a username is asked twice ─────────────────
{
  console.log("\n8. Existing accounts are never asked again");
  const { c, page } = await app({ profileRow: DBROW });
  const body = await page.locator("body").innerText();
  ok("no picker for an account that has one", !/Pick a username/i.test(body), body.slice(0, 120));
  await c.close();
}

/* The nastiest case, and the reason the session is consulted as well as the
   profile: an account created before this field existed, whose cached
   profile has no username in it. Asking that person to choose again would
   greet them with "that username is taken" — by themselves. */
{
  console.log("\n9. A cached profile from before this change doesn't trap anyone");
  const { c, page } = await app({
    profileRow: null,
    cached: JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }),
  });
  await page.evaluate((s) => localStorage.setItem("ros:session", s),
    JSON.stringify({ email: "old@example.com", provider: "email", token: "t", id: UID,
      refresh: "r", username: "oldtimer", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const body = await page.locator("body").innerText();
  ok("a session that remembers a username is enough", !/Pick a username/i.test(body), body.slice(0, 120));
  await c.close();
}

/* The app has been bitten by this before: iOS zooms into any field under
   16px and never zooms back out. A global rule covers every input, but a
   screen that forgot to render <Styles> would slip through it, so this
   checks the computed size on the real element rather than trusting the
   stylesheet exists. */
{
  console.log("\n10. The field doesn't make iOS zoom");
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await c.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => localStorage.setItem("ros:session", s), session());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const size = await page.getByLabel("Username").evaluate((el) => getComputedStyle(el).fontSize);
  ok("the username field is at least 16px on a phone", parseFloat(size) >= 16, size);
  await c.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
