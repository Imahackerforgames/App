// ═══════════════════════════════════════════════════════════════
// RETIRED — Stripe is no longer this app's payment processor.
//
// Not deployed, and nothing in the app calls it. Commas took over: see
// supabase/functions/commas-checkout and commas-webhook.
//
// Kept rather than deleted because it is the only record of how the Stripe
// integration worked, including the 52.08% partner split and why that
// number is not 50 — and because "at this moment" was how the switch was
// described, which is not the same as never.
//
// Before redeploying either of these: every Stripe subscription on the
// account is cancelled, and the payment links are deactivated. Turning the
// function back on does not turn those back on.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// supabase/functions/stripe-webhook/index.ts
//
// The thing that was missing. Somebody pays, Stripe tells this endpoint,
// and this endpoint writes `pro` into entitlements. Without it, money can
// arrive and the app never finds out — which is exactly why premium has
// been granted by hand until now.
//
// verify_jwt is OFF and must be: Stripe has no Supabase session and cannot
// send one. The security is the signature, checked below. Nothing else in
// this file trusts the request.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secrets (set them in the Supabase dashboard, never in code):
//   STRIPE_WEBHOOK_SECRET   whsec_...  REQUIRED. Signature verification.
//   STRIPE_SECRET_KEY       sk_live_/rk_live_...  OPTIONAL, and deliberately
//                           so: it only sharpens the expiry date. A missing
//                           or wrong key must never cost somebody a
//                           purchase they paid for. See the retrieve below.
// ═══════════════════════════════════════════════════════════════

import Stripe from "npm:stripe@^17.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

/* Deno has no Node crypto, so the SDK needs its WebCrypto provider to
   verify signatures. Without this the constructEventAsync call below throws
   on every request and nobody can ever be upgraded. */
const stripe = new Stripe(STRIPE_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

/* A wrong-shaped key cost a real test payment its upgrade and took a log
   dig to find, because the failure surfaced as a generic 500 four hours
   later. The Stripe dashboard shows a key's *id* next to the key itself and
   they are easy to confuse; an id is not usable as a credential. Say so at
   boot, by name, so the next person reads one line instead of a stack. */
if (STRIPE_KEY && !/^(sk|rk)_/.test(STRIPE_KEY)) {
  console.error(
    "stripe-webhook: STRIPE_SECRET_KEY does not look like a secret key " +
    `(starts with "${STRIPE_KEY.slice(0, 3)}", expected "sk_" or "rk_"). ` +
    "It is probably the key's ID copied from the dashboard list rather than " +
    "the key. Upgrades still work; expiry dates fall back to an estimate.",
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/* Writing to entitlements. The service role, because the table is
   deliberately unwritable by anything a browser can reach — that is the
   whole reason clicking "upgrade" cannot grant anything. */
const admin = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
});

async function upsertEntitlement(row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/entitlements?on_conflict=user_id`, {
    method: "POST",
    headers: { ...admin(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`entitlements write failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/* Which account a later event belongs to.

   Renewals and cancellations carry no user id — only the customer. This is
   the lookup that makes the mapping recorded at checkout time useful, and
   it is why the two stripe_* columns exist. */
async function accountForCustomer(
  customerId: string,
): Promise<{ userId: string; subId: string | null } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/entitlements?select=user_id,stripe_subscription_id&stripe_customer_id=eq.${encodeURIComponent(customerId)}&limit=1`,
    { headers: admin() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.user_id) return null;
  return {
    userId: String(row.user_id),
    subId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
  };
}

/* Premium runs until the end of the period that was paid for, plus a day.

   The grace day is deliberate. Stripe bills on a schedule and webhooks can
   be late or lost; expiring to the minute would drop someone to Free while
   their renewal is still in flight, and being wrongly locked out of
   something you have paid for is a far worse failure than a day of free
   access. It is also a backstop: if a cancellation webhook never arrives at
   all, premium still lapses on its own rather than lasting forever. */
const GRACE_MS = 24 * 60 * 60 * 1000;

/* Only used when Stripe's real period end could not be read. Every plan
   this app sells is monthly, so a month plus slack is the safe guess: too
   short would drop a paying customer to Free, too long gives away days.
   If an annual plan is ever added this needs to stop being a constant. */
const ESTIMATED_PERIOD_MS = 32 * 24 * 60 * 60 * 1000;
const periodEnd = (sub: any): string | null => {
  const secs = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return secs ? new Date(secs * 1000 + GRACE_MS).toISOString() : null;
};

/* Statuses that mean "this person has paid and should have the product".

   `past_due` is included on purpose: the card failed, Stripe is retrying,
   and cutting someone off mid-retry over a expired card is how you turn a
   billing hiccup into a cancellation. `unpaid` and `canceled` are not —
   those are Stripe having given up. */
const ACTIVE = new Set(["active", "trialing", "past_due"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  /* Only the signing secret is load-bearing. Signature verification runs on
     WebCrypto, not on the API key, so refusing every event for want of a
     key would reject payments this endpoint can in fact handle. */
  if (!WEBHOOK_SECRET) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not set.");
    return json({ error: "Stripe is not configured." }, 500);
  }

  /* The raw body, not the parsed one. The signature is computed over the
     exact bytes Stripe sent, so re-serialising JSON would change them and
     every event would be rejected. */
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw, signature, WEBHOOK_SECRET, undefined, cryptoProvider,
    );
  } catch (e) {
    /* This is the only thing standing between this endpoint and anyone on
       the internet granting themselves premium by POSTing some JSON at it.
       A failure here is a refusal, never a warning. */
    console.error("stripe-webhook: signature rejected:", String(e).slice(0, 200));
    return json({ error: "Invalid signature." }, 400);
  }

  try {
    switch (event.type) {
      /* Somebody just paid. The only event that knows who they are, because
         the checkout link carried the account id in client_reference_id. */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) {
          /* Worth shouting about: it means the checkout link lost its
             ?client_reference_id=, so a real payment has arrived that
             cannot be attached to anybody. Answer 200 anyway — retrying
             will not add the id, and the money is real, so this needs a
             human rather than a redelivery loop. */
          console.error("stripe-webhook: paid session with no client_reference_id — cannot match a user.", session.id);
          return json({ received: true, matched: false });
        }

        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        /* The event payload names the subscription but not when it ends, so
           the exact date needs an API call. That call is the one part of
           this path that can fail for reasons having nothing to do with the
           payment — a rotated, revoked or mistyped key — and it must not be
           able to take the upgrade down with it. A real payment arrived; the
           only acceptable outcome is `pro`.

           So: try for the real date, fall back to an estimate, never throw.
           The estimate is self-correcting — customer.subscription.updated
           carries current_period_end in its own payload and overwrites this
           with the true date at the first renewal. */
        let expiresAt: string | null = null;
        if (subId) {
          try {
            expiresAt = periodEnd(await stripe.subscriptions.retrieve(subId));
          } catch (e) {
            expiresAt = new Date(Date.now() + ESTIMATED_PERIOD_MS + GRACE_MS).toISOString();
            console.error(
              `stripe-webhook: could not read ${subId} (${String(e).slice(0, 160)}). ` +
              `Granting pro until ${expiresAt} on estimate; a renewal event will correct it.`,
            );
          }
        }

        await upsertEntitlement({
          user_id: userId,
          plan: "pro",
          activated_at: new Date().toISOString(),
          expires_at: expiresAt,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subId ?? null,
          note: "Stripe checkout",
          updated_at: new Date().toISOString(),
        });
        console.log(`stripe-webhook: ${userId} upgraded to pro until ${expiresAt ?? "no expiry"}.`);
        break;
      }

      /* Renewals, cancellations and status changes. These carry no user id,
         so the account is found by the customer recorded at checkout. */
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (!customerId) break;

        const account = await accountForCustomer(customerId);
        if (!account) {
          /* Can happen legitimately if events arrive out of order and the
             checkout event has not landed yet. That one sets the correct
             state when it does, so this is a warning rather than a retry. */
          console.warn(`stripe-webhook: no account for customer ${customerId}; ignoring ${event.type}.`);
          break;
        }
        const { userId, subId: onRecord } = account;

        /* Is this event even about the subscription this account is on?

           The customer is the only handle these events carry, so the
           account is found by customer. That is fine while a customer has
           one subscription and wrong the moment they have two: cancelling
           either one looks identical from here, and the account would be
           switched off while the other subscription carries on charging
           them. Somebody paying, locked out of what they are paying for —
           a refund and probably a chargeback, and the customer is right.

           `stripe_subscription_id` records which subscription the account
           is actually on, written by the checkout event. An event about
           any other subscription is not about this account's access, so it
           does not touch it. The recorded one stays authoritative until a
           checkout event replaces it. */
        if (onRecord && sub.id !== onRecord) {
          console.warn(
            `stripe-webhook: ${event.type} for ${sub.id}, but ${userId} is on ${onRecord}. ` +
            `Leaving their plan alone — a second subscription ending is not this one ending.`,
          );
          break;
        }

        const stillPaid = event.type !== "customer.subscription.deleted" && ACTIVE.has(sub.status);
        await upsertEntitlement({
          user_id: userId,
          plan: stillPaid ? "pro" : "free",
          expires_at: stillPaid ? periodEnd(sub) : null,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          note: stillPaid ? `Stripe ${sub.status}` : `Stripe ${event.type === "customer.subscription.deleted" ? "cancelled" : sub.status}`,
          updated_at: new Date().toISOString(),
        });
        console.log(`stripe-webhook: ${userId} -> ${stillPaid ? "pro" : "free"} (${event.type}, ${sub.status}).`);
        break;
      }

      default:
        /* Stripe sends plenty this app has no opinion about. Acknowledging
           them keeps the endpoint healthy in Stripe's dashboard; failing
           them would make it look broken and trigger pointless retries. */
        break;
    }

    return json({ received: true });
  } catch (e) {
    /* A 500 asks Stripe to retry, which is right for a transient database
       failure — the alternative is a payment that silently never grants
       anything. Stripe retries for up to three days. */
    console.error("stripe-webhook: handler failed:", String(e).slice(0, 500));
    return json({ error: "Handler failed." }, 500);
  }
});
