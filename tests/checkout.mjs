/* Where "Upgrade to premium" actually sends people.

   Four buttons open checkout and they must not drift apart, which is why
   openCheckout is one function and why this checks all four.

   The test adapts to whether the Stripe link has been pasted in yet. Before
   it is set, the right behaviour is to say so and open nothing — a button
   that opens a blank tab at someone trying to give you money is worse than
   one that explains itself. After it is set, the link must carry the
   account id, because that is the entire mechanism by which Stripe's
   webhook matches a payment to an account. Both states are correct at
   different times, so both are asserted. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

await page.route("**://*.supabase.co/**", (r) => r.abort());
await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

const UID = "u1";
await page.addInitScript((uid) => {
  localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email",
    token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "tester", onboarded: true,
    theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  /* Capture rather than navigate, so a real checkout is never opened. */
  window.__opened = [];
  window.__alerts = [];
  window.open = (u) => { window.__opened.push(String(u)); return { closed: false }; };
  window.alert = (m) => { window.__alerts.push(String(m)); };
}, UID);

await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

const press = async (label, steps) => {
  await steps();
  await page.getByRole("button", { name: /Upgrade to premium/ }).first().click({ force: true });
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ opened: window.__opened, alerts: window.__alerts }));
};

const entries = [
  ["AI Discover popup", async () => {
    await page.getByRole("button", { name: /^Discover$/ }).click({ force: true });
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: /AI Discover/ }).click({ force: true });
    await page.waitForTimeout(300);
  }],
  ["Listing popup", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
    await page.waitForTimeout(350);
    await page.getByRole("button", { name: /^Listing$/ }).click({ force: true });
    await page.waitForTimeout(300);
  }],
  ["assistant popup", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator("button").filter({ hasText: "" }).last().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }],
  ["Settings button", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
    await page.waitForTimeout(500);
  }],
];

let fired = 0;
for (const [label, steps] of entries) {
  const { opened, alerts } = await press(label, steps).catch(() => ({ opened: [], alerts: [] }));
  const url = opened.at(-1);
  const note = alerts.at(-1) || "";

  if (url) {
    fired++;
    ok(`${label}: opens a real https link`, /^https:\/\//.test(url), url);
    /* The whole point. Without this the webhook receives a payment with no
       account attached and somebody reconciles it by hand. */
    ok(`${label}: carries the account id`,
       new URL(url).searchParams.get("client_reference_id") === UID, url);
  } else if (note) {
    fired++;
    ok(`${label}: explains the link isn't set yet`, /checkout link hasn't been set/i.test(note), note);
    ok(`${label}: and opens nothing`, opened.length === 0, JSON.stringify(opened));
  } else {
    ok(`${label}: did something`, false, "neither opened a link nor said why");
  }
}
ok("all four entry points respond", fired === 4, String(fired));

/* Signed out, checkout must refuse. Taking money that cannot be matched to
   an account is worse than not taking it. */
await page.evaluate(() => { localStorage.removeItem("ros:session"); });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const signedOut = await page.evaluate(() => ({ opened: window.__opened, alerts: window.__alerts }));
ok("signed out, nothing was opened on load", signedOut.opened.length === 0, JSON.stringify(signedOut.opened));

const body = await page.locator("body").innerText();
ok("no stale payment provider named anywhere", !/commas/i.test(body), body.match(/.{0,40}commas.{0,20}/i)?.[0]);

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
