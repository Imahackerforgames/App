/* Inventory and sales living on the server instead of in the browser.

   The bug behind this: data was kept in local storage, so it did not survive
   closing a tab, did not follow anyone to a second device, and was invisible
   between reamp.store and www.reamp.store because those are separate
   origins. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const UID = "11111111-1111-1111-1111-111111111111";
const item = (title, id = "inv_1") => ({ id, title, units: 2, unitsLeft: 2, cost: 20,
  addedAt: new Date().toISOString(), notes: "", soldOutAt: null });
const row = (title, id = "inv_1") => ({ user_id: UID, id, title, units: 2, units_left: 2,
  cost: "20.00", purchase_date: null, notes: null, added_at: new Date().toISOString(), sold_out_at: null });

/* A tiny stand-in for the database: remembers what was written so a later
   read returns it, which is the whole property under test. */
async function app({ remote = { inventory: [], sales: [], watchlist: [] }, offline = false, local = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 880 } });
  const page = await ctx.newPage();
  const seen = [];
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });

  /* Registered first on purpose: Playwright checks route handlers in reverse
     order of registration, so a catch-all added last swallows everything
     added before it. */
  await page.route("**://*.supabase.co/**", (r) => r.abort());

  await page.route(/\/rest\/v1\/(inventory|sales|watchlist|profiles)/, async (route) => {
    const req = route.request();
    const url = req.url();
    const table = url.match(/rest\/v1\/(\w+)/)[1];
    seen.push({ table, method: req.method() });
    if (offline) return route.abort();

    if (req.method() === "GET") {
      if (table === "profiles") return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify([{ id: UID, name: "", state: "CA", zip: "90001", radius: 25,
          theme: "obsidian", onboarded: true, settings: null }]) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(remote[table] || []) });
    }
    if (req.method() === "POST") {
      const rows = JSON.parse(req.postData() || "[]");
      remote[table] = rows;                       // upsert
      return route.fulfill({ status: 201, body: "" });
    }
    if (req.method() === "DELETE") {
      if (!/id=not\.in/.test(url)) remote[table] = [];
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/rest\/v1\/entitlements/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  await page.addInitScript(([uid, loc]) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ onboarded: true, theme: "obsidian", state: "CA", zip: "90001", radius: 25 }));
    if (loc) localStorage.setItem(`ros:u:${uid}:inventory`, loc);
  }, [UID, local]);

  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return { ctx, page, seen, remote };
}
const business = async (page) => {
  await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
  await page.waitForTimeout(900);
  return page.locator("body").innerText();
};

// ── 1. what the server holds is what you see ───────────────────────────
{
  console.log("\n1. Inventory comes from the server");
  const { ctx, page, seen } = await app({ remote: { inventory: [row("SERVER ITEM")], sales: [], watchlist: [] } });
  ok("it asked the database", seen.some((s) => s.table === "inventory" && s.method === "GET"),
     JSON.stringify(seen.slice(0, 4)));
  ok("and shows what came back", /SERVER ITEM/.test(await business(page)));
  await ctx.close();
}

// ── 2. the server wins over a stale browser copy ───────────────────────
{
  console.log("\n2. A stale browser copy does not override the server");
  const { ctx, page } = await app({
    remote: { inventory: [row("SERVER ITEM")], sales: [], watchlist: [] },
    local: JSON.stringify([item("OLD LOCAL ITEM", "inv_old")]),
  });
  const body = await business(page);
  ok("shows the server's copy", /SERVER ITEM/.test(body));
  ok("not the stale local one", !/OLD LOCAL ITEM/.test(body), body.match(/.{0,50}LOCAL.{0,30}/)?.[0]);
  await ctx.close();
}

// ── 3. first sign-in uploads what's already in the browser ─────────────
{
  console.log("\n3. Existing browser data is uploaded, not lost");
  const { ctx, page, remote } = await app({
    remote: { inventory: [], sales: [], watchlist: [] },
    local: JSON.stringify([item("MIGRATED ITEM", "inv_mig")]),
  });
  ok("it still shows on screen", /MIGRATED ITEM/.test(await business(page)));
  await page.waitForTimeout(600);
  ok("and it reached the database",
     (remote.inventory || []).some((r) => r.title === "MIGRATED ITEM"),
     JSON.stringify(remote.inventory));
  ok("stamped with the owner",
     (remote.inventory || []).every((r) => r.user_id === UID), JSON.stringify(remote.inventory?.[0]));
  await ctx.close();
}

// ── 4. adding something sends it up ────────────────────────────────────
{
  console.log("\n4. A new product is written to the server");
  const { ctx, page, remote } = await app();
  /* From Home, "Add a product" only navigates. The sheet lives on Business. */
  await page.getByRole("button", { name: /^Business$/ }).click({ force: true });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Add product|Add a product/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  const f = page.locator(".fld");
  await f.nth(0).fill("Cloud Widget");
  await f.nth(1).fill("2");
  await f.nth(2).fill("15");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Add to inventory/i }).click({ force: true });
  await page.waitForTimeout(1500);
  ok("the database has it", (remote.inventory || []).some((r) => r.title === "Cloud Widget"),
     JSON.stringify(remote.inventory));
  ok("with the right numbers",
     remote.inventory?.[0]?.units === 2 && Number(remote.inventory?.[0]?.cost) === 15,
     JSON.stringify(remote.inventory?.[0]));
  await ctx.close();
}

// ── 5. no connection is not the same as no data ────────────────────────
{
  console.log("\n5. Offline keeps working and says so");
  const { ctx, page } = await app({ offline: true, local: JSON.stringify([item("OFFLINE ITEM", "inv_off")]) });
  const body = await business(page);
  ok("the browser copy is still shown", /OFFLINE ITEM/.test(body));
  ok("and it is not silently blanked", !/No products yet|Nothing here/i.test(body));
  const all = await page.locator("body").innerText();
  ok("the person is told", /offline|saved on this device/i.test(all),
     all.match(/.{0,80}(offline|device).{0,40}/i)?.[0]);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
