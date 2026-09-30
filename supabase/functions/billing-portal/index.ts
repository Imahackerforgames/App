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
// supabase/functions/billing-portal/index.ts
//
// "Manage subscription" — a link into Stripe's own billing portal, where a
// member can cancel, change their card, and read their invoices.
//
// Why Stripe's page rather than our own cancel button: cancelling is the
// moment a person is most likely to feel tricked, and the portal is a page
// Stripe builds, maintains and keeps truthful about what is actually being
// charged. A homegrown button is one deploy away from disagreeing with
// Stripe about whether somebody still pays us.
//
// It also removes the temptation to make cancelling hard. Somewhere that
// looks like a trap gets charged back rather than cancelled, and being easy
// to leave is increasingly what the law expects of a subscription too.
//
// verify_jwt is ON. This returns a link that can cancel a subscription and
// read invoices, so the caller must prove who they are — and the customer
// is then read from OUR record of them, never from the request.
//
// Deploy:  supabase functions deploy billing-portal
//
// Secrets:
//   STRIPE_SECRET_KEY   sk_live_... or rk_live_...  REQUIRED here.
//     Unlike the webhook, this genuinely cannot work without it: there is
//     no offline way to mint a portal link. A key that is missing or the
//     wrong shape is reported as such rather than as a generic failure.
// ═══════════════════════════════════════════════════════════════

import Stripe from "npm:stripe@^17.0.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

/* Where Stripe sends them when they are finished. Their own site, not a
   Stripe page they have to work out how to leave. */
const RETURN_URL = Deno.env.get("APP_URL") ?? "https://www.reamp.store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const stripe = new Stripe(STRIPE_KEY, { httpClient: Stripe.createFetchHttpClient() });

/* Who is asking. The token is checked against Supabase rather than merely
   decoded — a signature this function does not verify is not proof of
   anything, and the id it yields is the only thing standing between one
   member and another member's billing. */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return u?.id ? String(u.id) : null;
}

/* Which Stripe customer that account is, read from our own table with the
   service role.

   Deliberately not taken from the request. A customer id supplied by the
   caller would let anyone who guessed one open somebody else's billing
   portal — cancel their subscription, read their invoices, see their
   address. The account id comes from a verified token; the customer id
   comes from the row that account owns. Nothing in between is trusted. */
async function customerFor(userId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/entitlements?select=stripe_customer_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  const id = Array.isArray(rows) ? rows[0]?.stripe_customer_id : null;
  return id ? String(id) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!STRIPE_KEY || !/^(sk|rk)_/.test(STRIPE_KEY)) {
    /* Said plainly, because the last time this was wrong it surfaced as a
       generic 500 hours after the event that triggered it. The dashboard
       shows a key's id right next to the key, and they look alike. */
    console.error(
      "billing-portal: STRIPE_SECRET_KEY is missing or is not a secret key" +
      (STRIPE_KEY ? ` (starts with "${STRIPE_KEY.slice(0, 3)}", expected "sk_" or "rk_")` : "") +
      ". A portal link cannot be created without one.",
    );
    return json({ error: "Billing isn't configured yet. Please contact support." }, 503);
  }

  const userId = await callerId(req);
  if (!userId) return json({ error: "Sign in again, then try once more." }, 401);

  const customer = await customerFor(userId);
  if (!customer) {
    /* A comped account, or premium granted by hand. There is no
       subscription and nothing to manage, and that is not an error — it is
       the single most likely non-paying case, so it gets its own answer
       rather than a failure the app has to guess the meaning of. */
    return json({ error: "no_subscription" }, 404);
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: RETURN_URL,
    });
    return json({ url: session.url });
  } catch (e) {
    const msg = String(e);
    /* The portal has to be switched on once in the Stripe dashboard. Until
       it is, Stripe refuses with a message about configuration — which
       means nothing to a member, so name the real cause in the log and
       keep the on-screen wording honest but plain. */
    console.error("billing-portal: could not create a session:", msg.slice(0, 300));
    if (/configuration/i.test(msg)) {
      return json({ error: "Billing isn't configured yet. Please contact support." }, 503);
    }
    return json({ error: "Couldn't open billing just now. Try again in a moment." }, 502);
  }
});
