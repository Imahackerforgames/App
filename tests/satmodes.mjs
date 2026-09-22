/* Saturation: Online and Local are different businesses.

   The bug: the mode chip was decorative. Both tabs read from the same
   six-item CATALOG, so Online and Local showed an identical list, every
   category filter showed one product or none, and "Local" told a person
   that sneakers and cologne were what moved within driving distance of
   them. Local resale is the things shipping makes uneconomic — furniture,
   tools, appliances — and it needed its own list. */
import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const UID = "u1";

async function app() {
  const c = await b.newContext({ viewport: { width: 400, height: 1000 } });
  const page = await c.newPage();
  page.on("pageerror", (e) => { console.log("  PAGEERROR " + e.message); fail++; });
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/rest\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
  await page.evaluate((uid) => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "a@b.com", provider: "email",
      token: "t", id: uid, refresh: "r", expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem(`ros:u:${uid}:profile`, JSON.stringify({ username: "tester", onboarded: true,
      theme: "obsidian", state: "GA", zip: "30106", radius: 25 }));
  }, UID);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /^Saturation$/ }).click({ force: true });
  await page.waitForTimeout(800);
  return { c, page };
}
const pickMode = async (page, name) => {
  await page.getByRole("button", { name: new RegExp(`^${name}$`) }).first().click({ force: true });
  await page.waitForTimeout(500);
};
/* The product rows, specifically. A row is a title followed by its
   "~N sellers · N/wk" line, so that pairing is what identifies one —
   scanning the whole body would also pick up nav labels, category chips
   and section headings, and then two tabs would look alike because they
   share a navbar. */
const products = async (page) => {
  const lines = (await page.locator("body").innerText()).split("\n").map((x) => x.trim());
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^~\d+ sellers/.test(lines[i + 1]) && lines[i]) out.push(lines[i]);
  }
  return [...new Set(out)];
};

// ── 1. the two tabs are not the same list ──────────────────────────────
{
  console.log("\n1. Online and Local show different products");
  const { c, page } = await app();
  await pickMode(page, "Online");
  const online = await products(page);
  await pickMode(page, "Local");
  const local = await products(page);

  ok("both tabs show products", online.length > 0 && local.length > 0,
     `${online.length} online, ${local.length} local`);

  /* The property that actually matters, and the one that was broken: not
     one product is on both. Naming individual products would be a weaker
     test, because only the top slice of each list is rendered. */
  const shared = online.filter((t) => local.includes(t));
  ok("not one product appears in both", shared.length === 0, shared.join(", "));

  ok("online leads with online goods",
     online.some((t) => /Jordan|Dunk|Sauvage|Cuban chain|AirPods/i.test(t)), online.join(", "));
  ok("local leads with local goods",
     local.some((t) => /Kallax|couch|Peloton|TV|mower|drill|washer/i.test(t)), local.join(", "));
  await c.close();
}

// ── 2. every category has something in it, both ways ───────────────────
{
  console.log("\n2. No category comes back empty");
  const { c, page } = await app();
  const EMPTY = /Nothing in this category/i;
  for (const mode of ["Online", "Local"]) {
    await pickMode(page, mode);
    for (const cat of ["All", "Shoes", "Clothes", "Jewelry", "Accessories", "Headwear", "Colognes", "Other"]) {
      await page.getByRole("button", { name: new RegExp(`^${cat}$`) }).first().click({ force: true });
      await page.waitForTimeout(220);
      const body = await page.locator("body").innerText();
      ok(`${mode} · ${cat}`, !EMPTY.test(body));
    }
    await page.getByRole("button", { name: /^All$/ }).first().click({ force: true });
    await page.waitForTimeout(200);
  }
  await c.close();
}

// ── 3. the ticket filters still have something on both sides ───────────
{
  console.log("\n3. Low and high ticket both have products");
  const { c, page } = await app();
  for (const mode of ["Online", "Local"]) {
    await pickMode(page, mode);
    for (const t of ["Low Ticket", "High Ticket"]) {
      await page.getByRole("button", { name: new RegExp(`^${t}$`) }).click({ force: true });
      await page.waitForTimeout(250);
      ok(`${mode} · ${t}`, !/Nothing in this category/i.test(await page.locator("body").innerText()));
    }
    await page.getByRole("button", { name: /^Any ticket$/ }).click({ force: true });
    await page.waitForTimeout(200);
  }
  await c.close();
}

/* ── 4. the honesty line ────────────────────────────────────────────────
   Local used to say "Based on 30106, 25 mile radius", which states that
   these figures were measured in that ZIP. They were not. The app is
   allowed to say what tends to move locally; it is not allowed to imply
   it counted it on the person's doorstep. */
{
  console.log("\n4. Local does not claim the figures were measured there");
  const { c, page } = await app();
  await pickMode(page, "Local");
  const body = await page.locator("body").innerText();
  ok("it does not say the numbers are based on the ZIP", !/Based on 30106/i.test(body));
  ok("it calls them estimates", /estimates/i.test(body), body.slice(0, 200));
  ok("and still says the radius searches use", /25 mile radius/i.test(body));
  await c.close();
}

// ── 5. local products are local-resale goods ───────────────────────────
{
  console.log("\n5. Local is stocked with things shipping makes uneconomic");
  const { c, page } = await app();
  await pickMode(page, "Local");
  await page.getByRole("button", { name: /^Other$/ }).first().click({ force: true });
  await page.waitForTimeout(350);
  const body = await page.locator("body").innerText();
  const bulky = ["couch", "mower", "washer", "fridge", "table", "generator", "bike", "shelf", "TV", "drill", "Peloton", "weight"];
  const hits = bulky.filter((w) => new RegExp(w, "i").test(body));
  ok("the list is bulky goods", hits.length >= 3, hits.join(", "));
  ok("sold on local marketplaces", /OfferUp|Marketplace/i.test(body));
  await c.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
