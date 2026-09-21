/* Terms, privacy, data export and account deletion.

   The placement matters as much as the words: agreeing to terms you were
   never shown is not agreement, so they appear on the sign-up screen
   before the account exists, not only in Settings afterwards. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const UID = "u1";
async function app({ signedIn = true, deleteReply = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const calls = [];
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/functions\/v1\/delete-account/, (r) => {
    calls.push("delete");
    if (deleteReply === "fail") return r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Couldn't delete everything. Nothing was removed — try again." }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  if (signedIn) {
    await page.evaluate((uid) => {
      localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
        token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
      localStorage.setItem(`ros:u:${uid}:inventory`, JSON.stringify([{ id: "inv_1", title: "Test Item",
        units: 1, unitsLeft: 1, cost: 20, addedAt: new Date().toISOString(), notes: "", soldOutAt: null }]));
    }, UID);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  return { ctx, page, calls };
}
const settings = async (page) => {
  await page.getByRole("button", { name: /^Settings$/ }).click({ force: true });
  await page.waitForTimeout(900);
};

// ── 1. shown before the account exists ─────────────────────────────────
{
  console.log("\n1. Terms are offered at sign-up, not after");
  const { ctx, page } = await app({ signedIn: false });
  await page.getByRole("button", { name: /^Sign up$/ }).first().click();
  await page.waitForTimeout(600);
  const body = await page.locator("body").innerText();
  ok("the agreement line is there", /By creating an account you agree/i.test(body), body.slice(-200));
  await page.getByRole("button", { name: /^Terms$/ }).click();
  await page.waitForTimeout(700);
  const terms = await page.locator("body").innerText();
  ok("the terms open", /Terms of Service/i.test(terms));
  ok("and lead with the thing that matters for this product",
     /Estimates are estimates/i.test(terms), terms.match(/.{0,80}Estimates.{0,60}/i)?.[0]);
  ok("saying they are not guarantees of income", /not guarantees, predictions or promises of income/i.test(terms));
  await ctx.close();
}

// ── 2. the privacy policy describes this app, not a template ───────────
{
  console.log("\n2. The privacy policy describes this app, without naming suppliers");
  const { ctx, page } = await app({ signedIn: false });
  await page.getByRole("button", { name: /^Sign up$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^Privacy Policy$/ }).click();
  await page.waitForTimeout(700);
  const t = await page.locator("body").innerText();
  /* The suppliers are deliberately not named — the owner does not want the
     stack published. This is the assertion that keeps that decision true:
     if a vendor name is ever pasted back into the copy, it fails here
     rather than on a customer's screen. */
  for (const who of ["Supabase", "Vercel", "Anthropic", "Tavily", "Resend", "Have I Been Pwned", "Google Fonts"]) {
    ok(`does not name ${who}`, !new RegExp(who, "i").test(t),
       t.match(new RegExp(`.{0,50}${who}.{0,50}`, "i"))?.[0]);
  }

  /* Not naming them is only defensible while the policy still admits they
     exist and says what they may not do. Silence about third parties
     altogether would be a misleading privacy policy, which is worse than
     the long version this replaced. These three lines are the floor. */
  ok("still says the app runs on other companies' infrastructure",
     /runs on other companies' infrastructure/i.test(t));
  ok("and that none of them may sell your data or advertise with it",
     /may sell your data or use it for advertising/i.test(t));
  ok("and offers the names to anyone who asks",
     /name them for anyone who asks/i.test(t));
  ok("states there is no analytics or tracking", /no analytics/i.test(t));
  ok("explains what the assistant is sent", /assistant is told/i.test(t));
  ok("and that it can be switched off", /Personalize with my business data/i.test(t));
  ok("explains the password check never sends the password",
     /password never leaves your device/i.test(t) && /first five characters/i.test(t),
     t.match(/.{0,60}first five.{0,60}/i)?.[0]);
  await ctx.close();
}

// ── 3. unanswered items are visible, not hidden ────────────────────────
{
  console.log("\n3. The bits needing a human decision are flagged");
  const { ctx, page } = await app({ signedIn: false });
  await page.getByRole("button", { name: /^Sign up$/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^Terms$/ }).click();
  await page.waitForTimeout(700);
  const t = await page.locator("body").innerText();
  /* Governing law is answered now — the United States, which the owner
     chose. It must no longer carry the flag, or the flag stops meaning
     anything. */
  /* Counting rather than matching proximity: the Contact section sits
     directly under Governing law, so anything that looks nearby catches the
     wrong flag. One flag left on the page, and it is the address one. */
  const flags = t.match(/NEEDS YOUR ANSWER/gi) || [];
  ok("governing law is answered, not flagged",
     /governed by the laws of the United States/i.test(t) && flags.length === 1,
     `${flags.length} flag(s): ${t.match(/governed by[\s\S]{0,60}/i)?.[0]}`);

  /* The support address is the one thing still outstanding. This assertion
     is what turns "I'll come back to it" into something that shouts if it
     is forgotten — and it will start failing the moment it is answered,
     which is the point. */
  ok("the support address is still marked as needing an answer",
     /NEEDS YOUR ANSWER[\s\S]{0,120}@/i.test(t),
     t.match(/NEEDS YOUR ANSWER.{0,100}/)?.[0]);
  await ctx.close();
}

// ── 4. export gives you a file with your data in it ────────────────────
{
  console.log("\n4. Export produces a real file");
  const { ctx, page } = await app();
  await settings(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.getByRole("button", { name: /Export my data/i }).click({ force: true }),
  ]);
  ok("a file is offered", !!download);
  ok("named for the app and dated", /^reamp-export-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
     download.suggestedFilename());
  const fs = await import("fs/promises");
  const path = await download.path();
  const json = JSON.parse(await fs.readFile(path, "utf8"));
  ok("it contains the inventory", json.inventory?.[0]?.title === "Test Item", JSON.stringify(json.inventory));
  ok("and the account it belongs to", json.account?.email === "a@b.com", JSON.stringify(json.account));
  ok("and the settings", !!json.settings);
  await ctx.close();
}

// ── 5. deletion is deliberate, and reachable ───────────────────────────
{
  console.log("\n5. Deleting an account takes more than one tap");
  const { ctx, page, calls } = await app();
  await settings(page);
  const body = await page.locator("body").innerText();
  ok("the option exists", /Delete my account/i.test(body));
  ok("with the consequence spelled out", /There is no undo/i.test(body));
  ok("and is kept apart from the milder erase", /Your account stays open/i.test(body));

  /* Typing the wrong thing must not delete anything. */
  page.once("dialog", (d) => d.accept("nope"));
  await page.getByRole("button", { name: /Delete my account/i }).click({ force: true });
  await page.waitForTimeout(800);
  ok("a wrong confirmation deletes nothing", calls.length === 0, JSON.stringify(calls));

  page.once("dialog", (d) => d.accept("DELETE"));
  await page.getByRole("button", { name: /Delete my account/i }).click({ force: true });
  await page.waitForTimeout(1500);
  ok("typing DELETE calls the server", calls.includes("delete"), JSON.stringify(calls));
  const after = await page.locator("body").innerText();
  ok("and it signs you out", /Log in|Sign up/i.test(after), after.slice(0, 80));
  await ctx.close();
}

// ── 6. a failed deletion says so rather than pretending ────────────────
{
  console.log("\n6. A failed deletion is reported, not swallowed");
  const { ctx, page } = await app({ deleteReply: "fail" });
  await settings(page);
  page.once("dialog", (d) => d.accept("DELETE"));
  await page.getByRole("button", { name: /Delete my account/i }).click({ force: true });
  await page.waitForTimeout(1500);
  const after = await page.locator("body").innerText();
  ok("the error is shown", /Nothing was removed/i.test(after), after.match(/.{0,80}removed.{0,40}/i)?.[0]);
  ok("and you are still signed in", !/^Log in$/m.test(after.slice(0, 60)));
  await ctx.close();
}

// ── 7. both documents reachable from Settings too ──────────────────────
{
  console.log("\n7. Both documents are in Settings as well");
  const { ctx, page } = await app();
  await settings(page);
  const body = await page.locator("body").innerText();
  ok("privacy link", /Privacy Policy/i.test(body));
  ok("terms link", /Terms of Service/i.test(body));
  ok("and a contact address", /support@reamp\.store/i.test(body));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
