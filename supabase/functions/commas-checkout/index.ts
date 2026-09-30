// ═══════════════════════════════════════════════════════════════
// supabase/functions/commas-checkout/index.ts
//
// Makes the payment page a signed-in person is sent to.
//
// This is the part that differs most from a static payment link. Commas
// creates a checkout session through its API and hands back a link, which
// means the link has to be minted server-side, per person, with their
// account id embedded as metadata.
//
// That is an improvement, not a chore. The account id is no longer in a
// URL the customer can see and edit; it is fixed to the session when the
// session is made, and Commas returns it on the payment webhook. Nobody
// can pay "as" somebody else by changing a link.
//
// verify_jwt is ON. The session is created for whoever the token says is
// asking, and never for an id supplied in the request.
//
// Deploy:  supabase functions deploy commas-checkout
//
// Secrets:
//   COMMAS_API_KEY   REQUIRED. Server-side only, like every other key here.
//   COMMAS_API_BASE  optional. Set it to https://qa.dev-fan-basis.com to
//                    run against Commas' sandbox instead of live.
//   COMMAS_PRICE_CENTS / COMMAS_FREQUENCY_DAYS  optional overrides, so the
//                    price can change without a deploy. The default is
//                    TEMPORARILY $1 for testing — see the banner below.
//                    Setting COMMAS_PRICE_CENTS=2500 restores the real
//                    price without waiting for a deploy.
//
// ── Where the shape below comes from ──
//
// Commas is the rebranded FanBasis, and the API still answers on the
// FanBasis host: every endpoint is served under /public-api/ on
// https://www.fanbasis.com, authenticated with an `x-api-key` header
// rather than a bearer token. Three fields are required — product.title,
// amount_cents and type — plus subscription.frequency_days when type is
// "subscription". The response carries `payment_link`.
//
// This was wrong in the first cut of this file, in the two ways most
// likely to look like an outage rather than a bug: the host was guessed as
// api.commas.com, and the key was sent as `Authorization: Bearer`, which
// is exactly the 401 an x-api-key endpoint returns. Both are now taken
// from the published reference rather than inferred.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("COMMAS_API_KEY") ?? "";
const API_BASE = (Deno.env.get("COMMAS_API_BASE") ?? "https://www.fanbasis.com").replace(/\/+$/, "");
/* Read defensively, because these two are the values somebody changes in a
   hurry from a dashboard to test something — and then changes back.
   Number("") is 0 and Number("free") is NaN; either one reaches Commas as a
   nonsense amount_cents and comes back a 400 that reads like an outage.

   A bad value falls back to the real price, never to a cheaper one. Getting
   this wrong in the safe direction means a refused test; getting it wrong
   in the other means selling premium for nothing and not noticing. */
const whole = (name: string, fallback: number, min: number) => {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    console.error(
      `commas-checkout: ${name} is "${raw}", which is not a whole number >= ${min}. Using ${fallback}.`,
    );
    return fallback;
  }
  return n;
};

/* ── TEMPORARY: $1, not $25 ──────────────────────────────────────────────
   A dollar is the smallest amount that produces a real charge, a real
   webhook and a real entitlement row, which is what has never once been
   proven end to end. Zero would be cheaper still, but a processor that
   refuses free subscriptions would fail the test for a reason that has
   nothing to do with this code.

   PUT THIS BACK TO 2500 BEFORE TAKING REAL CUSTOMERS. While it stands,
   anybody who subscribes pays $1 a month, indefinitely, and Commas will
   keep honouring that price on their subscription long after this line is
   changed — the same way a Stripe subscription kept its original split.
   That is the real cost of forgetting, not the lost $24.

   Every checkout logs the amount it sent, so the log says plainly which
   price is live rather than leaving it to memory.
   ─────────────────────────────────────────────────────────────────────── */
const REAL_PRICE_CENTS = 2500;
const TEST_PRICE_CENTS = 100;
const PRICE_CENTS = whole("COMMAS_PRICE_CENTS", TEST_PRICE_CENTS, 0);
if (PRICE_CENTS !== REAL_PRICE_CENTS) {
  console.warn(
    `commas-checkout: TEST PRICE ACTIVE — charging ${PRICE_CENTS} cents, not ${REAL_PRICE_CENTS}. ` +
    "Set COMMAS_PRICE_CENTS=2500, or restore the default in this file, before real customers buy.",
  );
}
const FREQUENCY_DAYS = whole("COMMAS_FREQUENCY_DAYS", 30, 1);
const RETURN_URL = Deno.env.get("APP_URL") ?? "https://www.reamp.store";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* Who is asking. Checked against Supabase rather than merely decoded — a
   signature this function does not verify is not proof of anything, and
   this id is what the payment will be attached to for as long as the
   account exists. */
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

/* Already paying? Then there is nothing to buy.

   Read server-side rather than trusting the app, because this is the call
   that spends money. The button is already hidden from premium accounts;
   this is the check that holds when the screen is stale, and two
   subscriptions on one account means one person charged twice for one
   thing. */
async function alreadyPro(userId: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/entitlements?select=plan,expires_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.plan !== "pro") return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!API_KEY) {
    console.error("commas-checkout: COMMAS_API_KEY is not set. No checkout can be created without one.");
    return json({ error: "Checkout isn't set up yet. Please contact support." }, 503);
  }

  const userId = await callerId(req);
  if (!userId) return json({ error: "Sign in first, so your payment can be matched to your account." }, 401);

  if (await alreadyPro(userId)) {
    return json({ error: "already_pro" }, 409);
  }

  /* Named outside the try so the catch below can say which URL failed. It
     was declared inside it, where the catch could not see it — so the one
     failure that most needed naming, a host that does not answer, threw a
     ReferenceError instead of logging the address it had tried. */
  const endpoint = `${API_BASE}/public-api/checkout-sessions`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      /* x-api-key, not a bearer token. Sending it the other way is a 401
         that reads exactly like a bad key. */
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subscription",
        amount_cents: PRICE_CENTS,
        product: {
          title: "Reamp Premium",
          description: "The AI assistant, AI Discover and Product Search.",
        },
        subscription: { frequency_days: FREQUENCY_DAYS },
        success_url: RETURN_URL,
        /* The whole mechanism by which a payment becomes premium. Commas
           returns this on the payment webhook; without it the money
           arrives attached to nobody. */
        metadata: { user_id: userId, app: "reamp" },
      }),
    });

    const body = await res.text();
    if (!res.ok) {
      /* Logged in full because this is a young integration and the failure
         is almost always a shape mismatch rather than an outage — the
         message names which field Commas did not like. */
      console.error(
        `commas-checkout: POST ${endpoint} failed ${res.status} (amount_cents=${PRICE_CENTS}):`, body.slice(0, 600),
        "\n  401 here means COMMAS_API_KEY is wrong, or was taken from the sandbox and sent at live.",
      );
      return json({ error: "Couldn't start checkout just now. Try again in a moment." }, 502);
    }

    const data = JSON.parse(body);
    /* payment_link is the documented field. The other spellings are kept
       only because this has not yet run against a real key, and the body is
       logged when none of them match — an unread response is how a working
       payment path comes to look broken. */
    const url = data?.payment_link ?? data?.data?.payment_link ?? data?.url;
    if (!url) {
      console.error(`commas-checkout: no payment_link in the response from ${endpoint}:`, body.slice(0, 600));
      return json({ error: "Couldn't start checkout just now. Try again in a moment." }, 502);
    }

    /* The amount, on the success path too. The banner above promises the
       log says which price is live; without this it only said so when a
       checkout failed, which is the one case where it does not matter. */
    console.log(`commas-checkout: session for ${userId} at ${PRICE_CENTS} cents / ${FREQUENCY_DAYS} days.`);
    return json({ url: String(url) });
  } catch (e) {
    console.error(`commas-checkout: could not reach ${endpoint}:`, String(e).slice(0, 400));
    return json({ error: "Couldn't reach the payment provider. Try again in a moment." }, 502);
  }
});
