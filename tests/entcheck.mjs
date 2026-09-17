import { chromium } from "playwright";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* Opens Settings with the entitlements endpoint answering however we like,
   presses the check button, and reads what it says back. */
async function check(reply) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 950 } });
  const page = await ctx.newPage();
  await page.route("**://*.supabase.co/**", (r) => r.abort());
  await page.route(/\/auth\/v1\/token/, (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "fresh", refresh_token: "rt", expires_in: 3600 }) }));
  await page.route(/\/rest\/v1\/entitlements/, reply);
  await page.addInitScript(() => {
    localStorage.setItem("ros:session", JSON.stringify({ email: "t@example.com", provider: "email", token: "tok", id: "u1",
      expiresAt: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem("ros:profile", JSON.stringify({ onboarded: true, theme: "heat", state: "CA", zip: "90001", radius: 25 }));
  });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  if (await page.getByText("Where are you located?").count()) {
    await page.selectOption('select[aria-label="State"]', { index: 1 });
    await page.getByRole("button", { name: /Show me opportunities/ }).click();
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: /^Settings$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /check again|Re-check my plan/ }).click();
  await page.waitForTimeout(700);
  const note = (await page.getByRole("status").textContent().catch(() => "")) || "";
  const body = await page.locator("body").innerText();
  await ctx.close();
  return { note, body };
}

const jsonReply = (status, body) => (r) =>
  r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

console.log("\nWhen the grant is in place");
{
  const { note, body } = await check(jsonReply(200, [{ plan: "pro", expires_at: "2027-09-17T05:12:10Z" }]));
  ok("says premium is active", /Premium is active/i.test(note), note);
  ok("and the Plan row flips to Premium", /Premium/.test(body));
}

console.log("\nWhen the account really is free");
{
  const { note } = await check(jsonReply(200, []));
  ok("says so, and suggests the fix", /still on the free plan/i.test(note) && /sign out/i.test(note), note);
}

console.log("\nWhen the session has expired");
{
  const { note } = await check(jsonReply(401, { message: "JWT expired" }));
  ok("names the expired session", /session has expired/i.test(note), note);
  ok("does not silently claim free", !/still on the free plan/i.test(note), note);
}

console.log("\nWhen the row is blocked or the table is missing");
{
  const { note } = await check(jsonReply(404, { message: 'relation "public.entitlements" does not exist' }));
  ok("passes the server's reason through", /does not exist/i.test(note), note);
}

console.log("\nWhen premium has run out");
{
  const { note } = await check(jsonReply(200, [{ plan: "pro", expires_at: "2020-01-01T00:00:00Z" }]));
  ok("says it expired rather than never existed", /expired/i.test(note), note);
}

console.log("\nWhen the network is down");
{
  const { note } = await check((r) => r.abort());
  ok("says it could not reach the server", /couldn't reach the server/i.test(note), note);
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
