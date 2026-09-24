/* The Stripe webhook, run in Node against a stubbed Stripe and database.

   This is the piece that turns money into access, so the failures that
   matter are asymmetric. Refusing a real payment is bad. Granting premium
   to someone who did not pay is worse, and an endpoint that anyone on the
   internet can POST at is exactly how that happens — which is why the
   signature check gets the most attention here. */
import { createRequire } from "module";
const require_ = createRequire("/home/user/App/package.json");
const { transformSync } = require_("esbuild");
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const src = readFileSync("/home/user/App/supabase/functions/stripe-webhook/index.ts", "utf8");
const js = transformSync(src, { loader: "ts", target: "es2022", format: "esm" }).code
  /* The real SDK is not installed here and npm: specifiers are Deno-only,
     so the import is swapped for a stub the harness controls. */
  .replace(/import Stripe from "npm:stripe[^"]*";/, "const Stripe = globalThis.__Stripe;");

const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 86400;

async function run({
  event,                 // the parsed event the signature check yields
  signatureValid = true,
  customerLookup = null, // what entitlements returns for a customer query
  writeFails = false,
  subscription = { id: "sub_1", status: "active", customer: "cus_1", current_period_end: PERIOD_END },
  configured = true,
} = {}) {
  const writes = [];
  const ENV = {
    SUPABASE_URL: "https://stub.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-stub",
    ...(configured ? { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" } : {}),
  };
  let handler;
  globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

  globalThis.__Stripe = class {
    constructor() {
      this.webhooks = {
        constructEventAsync: async () => {
          if (!signatureValid) throw new Error("No signatures found matching the expected signature");
          return event;
        },
      };
      this.subscriptions = { retrieve: async () => subscription };
    }
    static createFetchHttpClient() { return {}; }
    static createSubtleCryptoProvider() { return {}; }
  };

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (init.method === "POST" && u.includes("/entitlements")) {
      writes.push(JSON.parse(init.body));
      return writeFails
        ? new Response("boom", { status: 500 })
        /* 204 must carry a null body — Node's Response constructor
           rejects an empty string, which is a fault in this stub rather
           than in the function under test. */
        : new Response(null, { status: 204 });
    }
    if (u.includes("/entitlements")) {
      return new Response(JSON.stringify(customerLookup ? [{ user_id: customerLookup }] : []), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };

  const mod = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
  await import(mod + `#${Math.random()}`);
  const res = await handler(new Request("https://x/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
    body: JSON.stringify(event ?? {}),
  }));
  return { res, body: await res.json().catch(() => ({})), writes };
}

const paid = (over = {}) => ({
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", client_reference_id: "user-abc", customer: "cus_1", subscription: "sub_1", ...over } },
});

/* ── 1. the only thing between this endpoint and the internet ───────────
   Everything else in this file assumes the signature held. If it can be
   skipped, anyone who finds the URL can write themselves a pro row. */
{
  console.log("\n1. An unsigned request grants nothing");
  const { res, writes } = await run({ event: paid(), signatureValid: false });
  ok("refused with 400", res.status === 400, String(res.status));
  ok("and nothing was written", writes.length === 0, JSON.stringify(writes));
}
{
  const { res, writes } = await run({ event: paid(), configured: false });
  ok("an unconfigured function refuses too", res.status === 500, String(res.status));
  ok("still writing nothing", writes.length === 0);
}

// ── 2. a real payment upgrades the right account ───────────────────────
{
  console.log("\n2. A completed checkout grants premium");
  const { res, writes } = await run({ event: paid() });
  ok("acknowledged", res.status === 200, String(res.status));
  ok("exactly one write", writes.length === 1, String(writes.length));
  const w = writes[0] || {};
  ok("to the account that paid", w.user_id === "user-abc", JSON.stringify(w.user_id));
  ok("set to pro", w.plan === "pro", JSON.stringify(w.plan));
  /* The mapping later events depend on. Without these two, a cancellation
     can never be matched and the person keeps premium forever. */
  ok("the customer is recorded", w.stripe_customer_id === "cus_1", JSON.stringify(w.stripe_customer_id));
  ok("and the subscription", w.stripe_subscription_id === "sub_1", JSON.stringify(w.stripe_subscription_id));
  ok("with an expiry past the paid period", new Date(w.expires_at).getTime() > PERIOD_END * 1000,
     `${w.expires_at} vs ${new Date(PERIOD_END * 1000).toISOString()}`);
}

/* ── 3. a payment nobody can be matched to ──────────────────────────────
   If the checkout link loses its ?client_reference_id=, real money arrives
   attached to nobody. That must be loud in the log and must not upgrade a
   guess, but it must also not be retried forever — no redelivery will add
   an id that was never sent. */
{
  console.log("\n3. A payment with no account id upgrades nobody");
  const { res, body, writes } = await run({ event: paid({ client_reference_id: null }) });
  ok("acknowledged rather than retried", res.status === 200, String(res.status));
  ok("and says it matched nobody", body.matched === false, JSON.stringify(body));
  ok("nothing was written", writes.length === 0, JSON.stringify(writes));
}

// ── 4. cancelling takes premium away ───────────────────────────────────
{
  console.log("\n4. A cancellation drops the account to free");
  const { res, writes } = await run({
    event: { type: "customer.subscription.deleted",
             data: { object: { id: "sub_1", status: "canceled", customer: "cus_1" } } },
    customerLookup: "user-abc",
  });
  ok("acknowledged", res.status === 200);
  const w = writes[0] || {};
  ok("the right account", w.user_id === "user-abc", JSON.stringify(w.user_id));
  ok("dropped to free", w.plan === "free", JSON.stringify(w.plan));
  ok("and the expiry cleared", w.expires_at === null, JSON.stringify(w.expires_at));
}

/* ── 5. a failing card is not a cancellation ────────────────────────────
   Stripe retries a failed payment for days. Cutting someone off the moment
   their card bounces turns a billing hiccup into a lost customer, so
   past_due keeps the product. */
{
  console.log("\n5. past_due keeps the product while Stripe retries");
  const { writes } = await run({
    event: { type: "customer.subscription.updated",
             data: { object: { id: "sub_1", status: "past_due", customer: "cus_1", current_period_end: PERIOD_END } } },
    customerLookup: "user-abc",
  });
  ok("still pro", writes[0]?.plan === "pro", JSON.stringify(writes[0]?.plan));
}
{
  const { writes } = await run({
    event: { type: "customer.subscription.updated",
             data: { object: { id: "sub_1", status: "unpaid", customer: "cus_1" } } },
    customerLookup: "user-abc",
  });
  ok("but unpaid does not", writes[0]?.plan === "free", JSON.stringify(writes[0]?.plan));
}

// ── 6. a renewal pushes the expiry forward ─────────────────────────────
{
  console.log("\n6. Renewing extends the expiry");
  const later = NOW + 60 * 86400;
  const { writes } = await run({
    event: { type: "customer.subscription.updated",
             data: { object: { id: "sub_1", status: "active", customer: "cus_1", current_period_end: later } } },
    customerLookup: "user-abc",
  });
  ok("still pro", writes[0]?.plan === "pro");
  ok("with the new period end", new Date(writes[0]?.expires_at).getTime() > later * 1000);
}

/* ── 7. an event for an unknown customer ────────────────────────────────
   Events can arrive out of order, so a subscription update may land before
   the checkout that created the mapping. The checkout sets the right state
   when it arrives, so this is ignored rather than guessed at. */
{
  console.log("\n7. An unmatched customer is ignored, not guessed");
  const { res, writes } = await run({
    event: { type: "customer.subscription.updated",
             data: { object: { id: "sub_9", status: "active", customer: "cus_unknown" } } },
    customerLookup: null,
  });
  ok("acknowledged", res.status === 200);
  ok("and nothing written", writes.length === 0, JSON.stringify(writes));
}

// ── 8. events this app has no opinion about ────────────────────────────
{
  console.log("\n8. Unrelated events are acknowledged, not failed");
  const { res, writes } = await run({ event: { type: "invoice.created", data: { object: {} } } });
  ok("200 so Stripe does not mark the endpoint broken", res.status === 200);
  ok("and nothing written", writes.length === 0);
}

/* ── 9. a database failure must be retried ──────────────────────────────
   The alternative is a payment that silently never grants anything. A 500
   tells Stripe to redeliver, which it does for three days. */
{
  console.log("\n9. A failed write asks Stripe to try again");
  const { res } = await run({ event: paid(), writeFails: true });
  ok("500, not a swallowed error", res.status === 500, String(res.status));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
