/* Breach-list checking at sign-up and at password reset.

   HIBP is stubbed here — the tests assert what we send and how we behave,
   never that a particular password is in the real corpus, which would make
   the suite depend on someone else's dataset. The k-anonymity property is
   the thing worth pinning down: the password must never leave the browser. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* SHA-1 of "Password1!" so the stub can answer truthfully for one password
   without pretending to be the whole corpus. */
const sha1 = async (s) => {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
};
const BREACHED = "Password1!";
const BREACHED_HASH = await sha1(BREACHED);
const CLEAN = "Tr0ubad0ur-Xk92!";

async function app({ hibp = "ok", signupStatus = 200 } = {}) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 } });
  const page = await ctx.newPage();
  const asked = [];
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  await page.route(/api\.pwnedpasswords\.com\/range\//, async (route) => {
    const url = route.request().url();
    asked.push({ url, headers: route.request().headers() });
    if (hibp === "down") return route.fulfill({ status: 503, body: "nope" });
    if (hibp === "offline") return route.abort();
    const prefix = url.split("/range/")[1];
    const rows = ["0018A45C4D1DEF81644B54AB7F969B88D65:1", "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2"];
    if (BREACHED_HASH.startsWith(prefix)) rows.push(`${BREACHED_HASH.slice(5)}:24230577`);
    return route.fulfill({ status: 200, body: rows.join("\r\n") });
  });

  await page.route(/\/auth\/v1\/signup/, (r) => r.fulfill({ status: signupStatus, contentType: "application/json",
    body: JSON.stringify({ user: { id: "u1" }, access_token: "t", refresh_token: "r", expires_in: 3600 }) }));
  await page.route("**://*.supabase.co/**", (r) => r.abort());

  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Sign up$/ }).first().click();
  await page.waitForTimeout(500);
  return { ctx, page, asked };
}

/* Two fields now: email then password. The username moved to its own
   screen after the account is created. Indexing by position is still how
   this works, so the count matters -- get it wrong and the email is never
   valid, submit returns early, and it looks exactly like the breach check
   failing rather than a broken fixture. */
const fillSignup = async (page, pw) => {
  const boxes = page.locator('input:visible');
  await boxes.nth(0).fill("newperson@example.com");
  await boxes.nth(1).fill(pw);
  await page.waitForTimeout(1400);   // past the 500ms debounce
};

// ── 1. the password never leaves the browser ───────────────────────────
{
  console.log("\n1. Only five characters of the hash are sent");
  const { ctx, page, asked } = await app();
  await fillSignup(page, BREACHED);
  ok("it asked HIBP", asked.length > 0, String(asked.length));
  const url = asked.at(-1)?.url || "";
  const prefix = url.split("/range/")[1] || "";
  ok("the request is a 5-character prefix", /^[0-9A-F]{5}$/.test(prefix), prefix);
  ok("and it is the right prefix", prefix === BREACHED_HASH.slice(0, 5), `${prefix} vs ${BREACHED_HASH.slice(0,5)}`);
  ok("the password is nowhere in the request", !url.includes(BREACHED) && !url.includes(encodeURIComponent(BREACHED)), url);
  ok("nor is the full hash", !url.includes(BREACHED_HASH), url);
  ok("padding is requested so the reply size gives nothing away",
     Object.keys(asked.at(-1).headers).some((h) => h.toLowerCase() === "add-padding"),
     JSON.stringify(Object.keys(asked.at(-1).headers)));
  await ctx.close();
}

// ── 2. a breached password is refused, visibly ─────────────────────────
{
  console.log("\n2. A breached password is caught while you're still typing");
  const { ctx, page } = await app();
  await fillSignup(page, BREACHED);
  const body = await page.locator("body").innerText();
  ok("it says so before submitting", /data breach/i.test(body), body.match(/.{0,80}breach.{0,60}/i)?.[0]);
  ok("and says how many times", /24,230,577/.test(body), body.match(/leaked.{0,40}/i)?.[0]);
  ok("even though every strength rule passed", !/Still needs/i.test(body));

  await page.getByRole("button", { name: "Create account", exact: true }).click({ force: true });
  await page.waitForTimeout(900);
  const after = await page.locator("body").innerText();
  ok("submitting is refused too", /known data breach/i.test(after), after.match(/.{0,90}breach.{0,40}/i)?.[0]);
  ok("no account was created", !/Good (morning|afternoon|evening)/.test(after));
  await ctx.close();
}

// ── 3. a clean password sails through ──────────────────────────────────
{
  console.log("\n3. A clean password is not obstructed");
  const { ctx, page, asked } = await app();
  await fillSignup(page, CLEAN);
  const body = await page.locator("body").innerText();
  ok("it was checked", asked.length > 0);
  ok("and nothing was said about breaches", !/data breach/i.test(body));
  await ctx.close();
}

// ── 4. HIBP being down must not break sign-up ──────────────────────────
{
  console.log("\n4. If the breach list is unreachable, people can still sign up");
  for (const mode of ["down", "offline"]) {
    const { ctx, page } = await app({ hibp: mode });
    await fillSignup(page, BREACHED);
    const body = await page.locator("body").innerText();
    ok(`(${mode}) no breach warning is invented`, !/data breach/i.test(body));
    await page.getByRole("button", { name: "Create account", exact: true }).click({ force: true });
    await page.waitForTimeout(1000);
    const after = await page.locator("body").innerText();
    ok(`(${mode}) sign-up is not blocked by someone else's outage`,
       !/known data breach/i.test(after), after.match(/.{0,80}breach.{0,40}/i)?.[0]);
    await ctx.close();
  }
}

// ── 5. half-typed passwords are not sent anywhere ──────────────────────
{
  console.log("\n5. Nothing is sent until the password is worth asking about");
  const { ctx, page, asked } = await app();
  const boxes = page.locator('input:visible');
  await boxes.nth(0).fill("newperson@example.com");
  await boxes.nth(1).fill("abc");          // fails the shape rules
  await page.waitForTimeout(1200);
  ok("a weak password is never sent to HIBP", asked.length === 0, JSON.stringify(asked.map((a) => a.url)));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
