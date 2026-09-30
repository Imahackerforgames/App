/* The Commas webhook, run in Node against a stubbed database.

   The failures are asymmetric in the same way as the Stripe one. Refusing
   a real payment is bad. Granting premium to somebody who did not pay is
   worse, and an endpoint anyone can POST at is how that happens — so the
   signature gets the most attention here.

   Written against Commas' published description rather than their API
   reference, which is not reachable from here: HMAC-SHA256 over the raw
   body, signature in x-webhook-signature, metadata returned on the payment
   event. Where a field name is a guess the handler tries several, and
   these tests pin the behaviour rather than the spelling. */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { createHmac } from "crypto";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const SECRET = "whsec-test-secret";
const src = readFileSync("/home/user/App/supabase/functions/commas-webhook/index.ts", "utf8");
const js = transformSync(src, { loader: "ts", target: "es2022", format: "esm" }).code;

async function run(body, { secret = SECRET, signature, configured = true, writeFails = false, lookup = null } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const writes = [];
  const ENV = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-stub",
    ...(configured ? { COMMAS_WEBHOOK_SECRET: secret } : {}),
  };
  let handler;
  globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === "POST" && u.includes("/entitlements")) {
      writes.push(JSON.parse(init.body));
      return writeFails ? new Response("boom", { status: 500 }) : new Response(null, { status: 204 });
    }
    if (u.includes("/entitlements")) {
      return new Response(JSON.stringify(lookup ? [lookup] : []), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  const mod = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  await import(mod + `#${Math.random()}`);
  const sig = signature !== undefined
    ? signature
    : createHmac("sha256", SECRET).update(raw).digest("hex");
  const res = await handler(new Request("https://x/functions/v1/commas-webhook", {
    method: "POST",
    headers: { "x-webhook-signature": sig, "content-type": "application/json" },
    body: raw,
  }));
  return { res, body: await res.json().catch(() => ({})), writes };
}

/* The real thing, copied from a live payment.succeeded that Commas sent for
   a completed $1 subscription — not a shape anybody guessed.

   The guessed shape is why this matters. It had `metadata.user_id` and a
   flat `subscription_id`, both of which passed these tests and neither of
   which exists. A customer paid, the handler could not find an account, and
   the money landed attached to nobody. A fixture invented alongside the code
   it tests can only ever confirm the author's assumptions. */
const REAL_PAID = {
  id: "b73ccf7c-3a66-450a-a626-9ebdc6ac5364",
  type: "payment.succeeded",
  data: {
    payment_id: "ORD-7KSX-D14D-N7H2",
    amount: 1,
    currency: "USD",
    status: "succeeded",
    payment_type: "subscription",
    payment_method: "card",
    buyer: { id: null, name: "A Buyer", email: "buyer@example.com", phone: null, address: null },
    item: { id: "olnDB", title: "Reamp Premium", type: "subscription" },
    api_metadata: { data: { user_id: "user-abc", app: "reamp", payment_type: "subscription" } },
    subscription: { id: "loD97", status: "active" },
  },
};

/* Deep-merges into data so a test can vary one field without rebuilding the
   whole payload. */
const paid = (over = {}) => ({
  ...REAL_PAID,
  data: { ...REAL_PAID.data, ...over },
});

/* ── 1. the only thing between this and the internet ────────────────── */
/* 401 and not 400, which is what Commas asks for: a signature failure is
   an authentication problem rather than a malformed request, and keeping
   the two apart is what makes a log readable when something is actually
   wrong. The Stripe path answers 400 because Stripe does not say
   otherwise; the difference is deliberate, not drift. */
console.log("\n1. An unsigned or wrongly signed request grants nothing");
{
  const { res, writes } = await run(paid(), { signature: "" });
  ok("no signature is refused", res.status === 401, String(res.status));
  ok("and nothing written", writes.length === 0);
}
{
  const { res, writes } = await run(paid(), { signature: "deadbeef" });
  ok("a wrong signature is refused", res.status === 401, String(res.status));
  ok("and nothing written", writes.length === 0);
}
{
  /* The classic: a valid HMAC, but of a different body. Signing the
     parsed-and-reserialised JSON instead of the bytes received would let
     this through. */
  const other = JSON.stringify(paid({ metadata: { user_id: "attacker" } }));
  const sig = createHmac("sha256", SECRET).update(other).digest("hex");
  const { res, writes } = await run(paid(), { signature: sig });
  ok("a signature over a different body is refused", res.status === 401, String(res.status));
  ok("and nothing written", writes.length === 0);
}
{
  const { res, writes } = await run(paid(), { configured: false });
  ok("an unconfigured endpoint refuses everything", res.status === 500, String(res.status));
  ok("still writing nothing", writes.length === 0);
}
{
  /* Base64 is as valid an encoding of the same HMAC as hex, and which one
     Commas sends is not documented anywhere reachable. Accepting either is
     not a weakening — both are a full HMAC under the secret. */
  const raw = JSON.stringify(paid());
  const b64 = createHmac("sha256", SECRET).update(raw).digest("base64");
  const { res, writes } = await run(raw, { signature: b64 });
  ok("a base64 signature is accepted", res.status === 200, String(res.status));
  ok("and it grants", writes.length === 1);
}
{
  const raw = JSON.stringify(paid());
  const hex = createHmac("sha256", SECRET).update(raw).digest("hex");
  const { res } = await run(raw, { signature: `sha256=${hex}` });
  ok("a scheme-prefixed signature is accepted", res.status === 200, String(res.status));
}

/* ── 2. a payment grants premium ────────────────────────────────────── */
console.log("\n2. A paid event upgrades the right account");
{
  const { res, writes } = await run(paid());
  ok("acknowledged", res.status === 200, String(res.status));
  ok("exactly one write", writes.length === 1, String(writes.length));
  const w = writes[0] || {};
  ok("to the account in the metadata", w.user_id === "user-abc", JSON.stringify(w.user_id));
  ok("set to pro", w.plan === "pro", JSON.stringify(w.plan));
  /* buyer.id is null on a real payment, so there is nothing to record and
     null is the honest value. The subscription is what identifies the
     account later, and it is nested at data.subscription.id. */
  ok("the subscription is recorded", w.commas_subscription_id === "loD97", JSON.stringify(w.commas_subscription_id));
  ok("a null buyer id is stored as null, not the string 'null'",
     w.commas_customer_id === null, JSON.stringify(w.commas_customer_id));
  /* Thirty days plus the grace day, so a renewal in flight cannot drop
     somebody to Free. */
  const days = (new Date(w.expires_at).getTime() - Date.now()) / 86400e3;
  ok("expires about 31 days out", days > 30.5 && days < 31.5, `${days.toFixed(2)} days`);
}
{
  const { writes } = await run(paid({ subscription: { id: "loD97", frequency_days: 365 } }));
  const days = (new Date(writes[0].expires_at).getTime() - Date.now()) / 86400e3;
  ok("an annual plan gets a year", days > 365 && days < 367, `${days.toFixed(1)} days`);
}
{
  /* No billing period anywhere in the real payload, which is the case that
     actually happens. A month is the right fallback because a month is what
     this app asked for when it created the session. */
  const { writes } = await run(paid());
  const days = (new Date(writes[0].expires_at).getTime() - Date.now()) / 86400e3;
  ok("a payload with no period falls back to a month", days > 30.5 && days < 31.5, `${days.toFixed(2)} days`);
}

console.log("\n3. A renewal extends it");
{
  const { res, writes } = await run({ type: "subscription.renewed", data: paid().data });
  ok("acknowledged", res.status === 200);
  ok("still pro", (writes[0] || {}).plan === "pro", JSON.stringify(writes[0]));
}

/* ── 4. a payment nobody can be matched to ──────────────────────────── */
/* ── the other events a real purchase produced ──────────────────────────
   One checkout produced payment.succeeded, subscription.created and, from
   an earlier attempt, payment.failed. Only the first was handled; the other
   two were logged as unknown. That was survivable here only because
   payment.succeeded also fires — if it ever does not, the grant has to come
   from somewhere. */
console.log("\n3b. The rest of what a real purchase sends");
{
  const { res, writes } = await run({ ...paid(), type: "subscription.created" });
  ok("subscription.created grants too", res.status === 200 && (writes[0] || {}).plan === "pro",
     JSON.stringify(writes));
  ok("to the same account", (writes[0] || {}).user_id === "user-abc");
}
{
  /* A subscription can exist without having been paid for. */
  const { writes } = await run({ ...paid(), type: "subscription.created",
                                 data: { ...paid().data, status: "pending" } });
  ok("but not when the payment has not succeeded", writes.length === 0, JSON.stringify(writes));
}
{
  /* A card that fails once gets retried. Switching somebody off mid-dunning
     takes away something they are still paying for. */
  const { res, writes } = await run({ type: "payment.failed", data: { payment_id: "ORD-X" } });
  ok("a failed payment is acknowledged", res.status === 200);
  ok("and revokes nothing", writes.length === 0, JSON.stringify(writes));
}

console.log("\n4. A payment with no account id");
{
  const e = paid(); delete e.data.api_metadata;
  const { res, body, writes } = await run(e);
  /* 200, not an error: redelivery will not add an id that was never sent,
     and the money is real, so this needs a person rather than a loop. */
  ok("acknowledged rather than retried forever", res.status === 200, String(res.status));
  ok("and says it matched nobody", body.matched === false, JSON.stringify(body));
  ok("nothing written", writes.length === 0, JSON.stringify(writes));
}

/* ── 5. cancelling ──────────────────────────────────────────────────── */
console.log("\n5. Cancelling takes it away");
{
  const { res, writes } = await run(
    { type: "subscription.cancelled", data: { subscription: { id: "loD97" }, buyer: { id: "cus_c1" } } },
    { lookup: { user_id: "user-abc", commas_subscription_id: "loD97" } },
  );
  ok("acknowledged", res.status === 200);
  ok("set to free", (writes[0] || {}).plan === "free", JSON.stringify(writes[0]));
  ok("and the expiry cleared", writes[0].expires_at === null, JSON.stringify(writes[0].expires_at));
}
{
  /* Spelled the American way. The exact event name is not documented
     anywhere reachable, so both spellings have to work — a cancellation
     that silently does nothing leaves somebody paying for nothing, or
     keeping access they stopped paying for. */
  const { writes } = await run(
    { type: "subscription.canceled", data: { subscription: { id: "loD97" } } },
    { lookup: { user_id: "user-abc", commas_subscription_id: "loD97" } },
  );
  ok("one L works too", (writes[0] || {}).plan === "free", JSON.stringify(writes[0]));
}
{
  const { writes } = await run(
    { type: "payment.refunded", data: { subscription: { id: "loD97" } } },
    { lookup: { user_id: "user-abc", commas_subscription_id: "loD97" } },
  );
  ok("a refund also removes it", (writes[0] || {}).plan === "free", JSON.stringify(writes[0]));
}

/* ── 6. two subscriptions on one customer ───────────────────────────── */
console.log("\n6. Cancelling a second subscription leaves the paid one alone");
{
  const { res, writes } = await run(
    { type: "subscription.cancelled", data: { subscription: { id: "sub_DUPLICATE" }, buyer: { id: "cus_c1" } } },
    { lookup: { user_id: "user-abc", commas_subscription_id: "loD97" } },
  );
  ok("acknowledged", res.status === 200);
  ok("and the account is untouched", writes.length === 0,
     "a second subscription ending is not this one ending — " + JSON.stringify(writes));
}

console.log("\n7. Events this app has no opinion about");
{
  const { res, writes } = await run({ type: "invoice.created", data: {} });
  ok("200, so the endpoint is not marked broken", res.status === 200);
  ok("and nothing written", writes.length === 0);
}

console.log("\n8. A failed write asks for a redelivery");
{
  const { res } = await run(paid(), { writeFails: true });
  ok("500, not a swallowed error", res.status === 500, String(res.status));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
