/* The white bands at the top and bottom on a phone.

   The app's root covers the viewport, but a phone shows more than the
   viewport: rubber-band scrolling drags the page past its own edge, and the
   notch and home-indicator strips sit outside it. The browser paints the
   *body* in both places, and the body had no background — so it came out
   white on every screen, login included. */
import { chromium, devices } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const WHITE = ["rgb(255, 255, 255)", "rgba(0, 0, 0, 0)", "transparent"];
const VOID = { obsidian: "rgb(13, 15, 16)", ivory: "rgb(247, 245, 240)",
               pearl: "rgb(244, 247, 250)", emerald: "rgb(11, 18, 16)" };

async function look({ theme = "obsidian", signedIn = true } = {}) {
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  if (signedIn) {
    await page.evaluate((th) => {
      localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
        token: "t", id: "u1", refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem("ros:u:u1:profile", JSON.stringify({ username: "tester", onboarded: true, theme: th, state: "CA", zip: "90001", radius: 25 }));
    }, theme);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const seen = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    root: getComputedStyle(document.getElementById("root")).backgroundColor,
    meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || null,
  }));
  return { ctx, page, seen };
}

// ── 1. the login screen, which is what a stranger sees first ───────────
{
  console.log("\n1. The login screen has no white edges");
  const { ctx, seen } = await look({ signedIn: false });
  ok("body is painted", !WHITE.includes(seen.body), seen.body);
  ok("html is painted", !WHITE.includes(seen.html), seen.html);
  ok("and both match", seen.body === seen.html, `${seen.body} vs ${seen.html}`);
  await ctx.close();
}

// ── 2. every theme, including the light ones ───────────────────────────
{
  console.log("\n2. Each palette paints its own ground");
  for (const [theme, expected] of Object.entries(VOID)) {
    const { ctx, seen } = await look({ theme });
    ok(`${theme}: body matches the palette`, seen.body === expected, `${seen.body} vs ${expected}`);
    ok(`${theme}: status bar colour follows it too`,
       seen.meta && seen.meta.toLowerCase() === (theme === "obsidian" ? "#0d0f10"
         : theme === "ivory" ? "#f7f5f0" : theme === "pearl" ? "#f4f7fa" : "#0b1210"),
       `${seen.meta}`);
    await ctx.close();
  }
}

// ── 3. scrolling past the end must not reveal white ────────────────────
{
  console.log("\n3. Overscrolling reveals the app's colour, not white");
  const { ctx, page, seen } = await look({ theme: "obsidian" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("still the app's ground after scrolling to the end", after === seen.body, `${after} vs ${seen.body}`);
  ok("and it is not white", !WHITE.includes(after), after);
  await ctx.close();
}

// ── 4. the very first paint, before React runs ─────────────────────────
{
  console.log("\n4. Nothing flashes white before the app mounts");
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  /* domcontentloaded, not networkidle: this is the moment the HTML exists
     and the bundle has not necessarily run. */
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  const early = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok("the document itself carries a background", !WHITE.includes(early), early);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
