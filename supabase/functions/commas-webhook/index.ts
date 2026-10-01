// ═══════════════════════════════════════════════════════════════
// supabase/functions/commas-webhook/index.ts
//
// Somebody pays through Commas, Commas tells this endpoint, and this
// endpoint writes `pro` into entitlements.
//
// verify_jwt is OFF and must be: Commas has no Supabase session and cannot
// send one. The signature is the security. Nothing else here trusts the
// request.
//
// Deploy:  supabase functions deploy commas-webhook --no-verify-jwt
//
// Secrets (Supabase dashboard, never in code):
//   COMMAS_WEBHOOK_SECRET   REQUIRED. The signing secret from the Commas
//                           webhook endpoint you register.
//
// ── The payload, as actually observed ──
//
// A real $1 subscription produced three events: payment.failed from an
// earlier attempt, then payment.succeeded and subscription.created, both
// carrying the same body. The shape below is copied from it, not guessed:
//
//   { id, type, data: {
//       payment_id, amount, currency, status: "succeeded",
//       payment_type: "subscription", payment_method: "card",
//       buyer: { id, name, email, phone, address },
//       item:  { id, title, type },
//       api_metadata: { data: { user_id, app, ... } },   <- our metadata
//       subscription: { id, status: "active", ... } } }
//
// The one that mattered: the `metadata` object sent when the checkout
// session is created comes back as `api_metadata`, with our object under a
// further `data` key — so `data.api_metadata.data.user_id`. The first
// version of this file read `data.metadata.user_id`, found nothing, and
// left a customer who had genuinely paid on the free plan.
//
// Two details from the real payload worth not re-deriving:
//
//   buyer.id was NULL. The payer is identified by buyer.email, not by an id,
//   so commas_customer_id is usually empty and the subscription id is the
//   only reliable key for matching an account to a later event.
//
//   data has no `id` of its own — there is payment_id, and the envelope has
//   its own id. Nothing in this file may fall back to a bare `id` for the
//   subscription, because both of those are payment-shaped identifiers.
//
// Still not observed, and still guessed: the renewal event's name, the
// cancellation event's name, and the billing period's field. The reads for
// those deliberately still try several spellings — that is not leftover
// guesswork, it is the only honest thing to do about an event nobody has
// seen. The period falls back to 30 days, which is right because that is
// what this app asks for when it creates the session.
//
// Signature: HMAC-SHA256 over the raw body in x-webhook-signature,
// confirmed working — real events pass the check.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("COMMAS_WEBHOOK_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

/* Which account a later event belongs to, when the event carries only a
   Commas customer or subscription rather than our own id. Only the first
   event knows who paid. */
async function accountForRef(column: string, value: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/entitlements?select=user_id,commas_subscription_id&${column}=eq.${encodeURIComponent(value)}&limit=1`,
    { headers: admin() },
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.user_id
    ? { userId: String(row.user_id), subId: row.commas_subscription_id ? String(row.commas_subscription_id) : null }
    : null;
}

/* Signature check.

   HMAC-SHA256 of the raw body under the webhook secret, compared with the
   x-webhook-signature header. Over the exact bytes received: re-serialising
   the JSON would change them and every event would be rejected.

   Compared in constant time. A comparison that returns early on the first
   wrong byte leaks how much of a guess was right, which is enough to
   recover a signature given enough attempts. */
const constantTimeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function signatureValid(raw: string, header: string): Promise<boolean> {
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const bytes = new Uint8Array(mac);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...bytes));

  /* Which encoding Commas sends is not documented anywhere reachable, and
     both are common. Accepting either is not a weakening — each is still a
     full HMAC under the secret — and it avoids rejecting every real event
     over a formatting guess. Some senders prefix the scheme. */
  const sent = header.trim().replace(/^(sha256=|hmac-sha256=)/i, "");
  return constantTimeEqual(sent.toLowerCase(), hex) || constantTimeEqual(sent, b64);
}

/* Expiring to the minute drops somebody to Free while their renewal is
   still in flight, and being locked out of something you have paid for is a
   worse failure than a day of free access. */
const GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;

/* Read a field that might be spelled several ways, at the top level or
   nested.

   The number of paths a call passes is now meaningful rather than
   incidental. One path means the spelling is confirmed against a real
   event. Several means the event carrying it has never been seen, so the
   alternatives are an honest admission rather than leftover guesswork.
   Anyone adding a path should be able to say which of those two they are
   doing. */
const pick = (obj: any, ...paths: string[]): any => {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  if (!WEBHOOK_SECRET) {
    console.error("commas-webhook: COMMAS_WEBHOOK_SECRET is not set.");
    return json({ error: "Not configured." }, 500);
  }

  const raw = await req.text();
  const sig = req.headers.get("x-webhook-signature")
    ?? req.headers.get("commas-signature")
    ?? "";

  if (!(await signatureValid(raw, sig))) {
    /* The only thing between this endpoint and anyone on the internet
       granting themselves premium. A failure is a refusal, never a
       warning.

       401 rather than 400, because Commas asks for it: a signature failure
       is an authentication problem, not a malformed request. */
    console.error("commas-webhook: signature rejected.");
    return json({ error: "Invalid signature." }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    console.error("commas-webhook: signed body was not JSON.");
    return json({ error: "Bad payload." }, 400);
  }

  /* Both confirmed against real events: the kind is top-level `type` and the
     body is top-level `data`. The alternative spellings that used to be tried
     here were guesses from before any payload had been seen, and a guess left
     in place reads like knowledge. An unrecognised type falls through to the
     default branch, which logs the whole event and does nothing — so being
     wrong here is loud and harmless rather than quiet and costly. */
  const type = String(pick(event, "type") ?? "");
  const data = pick(event, "data") ?? event;

  try {
    switch (true) {
      /* payment.failed is a real event and not an unknown one. It is
         deliberately not a revoke: a card that fails once is retried, and
         switching somebody off mid-dunning takes away something they are
         still paying for. Named here so it stops being logged as a mystery. */
      case /^(payment|charge)\.failed$/i.test(type):
        console.log(`commas-webhook: ${type} — no action; a retry may still succeed.`);
        break;

      case /^(payment|charge)\.(succeeded|paid|completed)$/i.test(type):
      case /^subscription\.(created|renewed|payment_succeeded)$/i.test(type): {
        /* subscription.created arrives alongside payment.succeeded carrying
           the same payload, so it is handled rather than ignored: two events
           that both grant are harmless, because the write is an upsert keyed
           on the account. One event that should have granted and did not is
           what leaves somebody paid-up and on the free plan.

           Guarded on the payment status all the same. A subscription that
           exists is not a subscription that has been paid for. */
        const paidStatus = String(pick(data, "status", "payment_status") ?? "succeeded");
        if (!/^(succeeded|paid|completed|active)$/i.test(paidStatus)) {
          console.log(`commas-webhook: ${type} with status "${paidStatus}" — not granting.`);
          break;
        }
        const userId = String(
          /* api_metadata.data.user_id is where it really is, seen on a real
             payment. The `metadata` object sent when the checkout session is
             created comes back wrapped twice: as `api_metadata`, with our
             object under a further `data` key.

             This cost a customer their premium on a completed payment. */
          pick(data, "api_metadata.data.user_id", "metadata.user_id") ?? "",
        );
        if (!userId) {
          /* Worth shouting about and worth a 200: retrying will not add an
             id that was never sent, and the money is real, so this needs a
             person rather than a redelivery loop. */
          console.error(
            "commas-webhook: paid event with no user id in metadata — cannot match an account.",
            JSON.stringify(event).slice(0, 2000),
          );
          return json({ received: true, matched: false });
        }

        /* Observed: the subscription is an object at data.subscription with
           its own id, and the payer is data.buyer. The billing period is not
           in the payload seen so far, so the fallback does the work — and it
           is the right number, because this app is what asked for 30 days
           when it created the session. */
        const days = Number(pick(data, "subscription.frequency_days", "subscription.interval_days",
                                 "subscription.frequency", "frequency_days", "interval_days"))
          || DEFAULT_PERIOD_DAYS;
        /* data.subscription.id, confirmed on a real payment.

           The bare "id" that used to sit at the end of this list is gone, and
           its removal is the point of this clean-up rather than tidying. The
           payload has no data.id, but it has payment_id and the envelope has
           its own id — so the day one of those turns up as data.id, that
           payment id would be written into commas_subscription_id. The guard
           further down then compares a cancellation's real subscription id
           against a payment id, decides the event is about some other
           subscription, and leaves a cancelled account on pro while the card
           stops being charged. A fallback that can only ever store the wrong
           kind of identifier is worse than no fallback. */
        const subId = pick(data, "subscription.id", "subscription_id");
        /* buyer.id came back null on the real payment, so this is usually
           null and commas_customer_id is usually empty. Left in because a
           future event may carry it, but do not build anything on it: the
           subscription id is the key that actually identifies the account,
           and buyer.email is the only other thing observed to be populated. */
        const customerId = pick(data, "buyer.id", "customer_id", "customer.id");

        await upsertEntitlement({
          user_id: userId,
          plan: "pro",
          activated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + days * 86400_000 + GRACE_MS).toISOString(),
          commas_customer_id: customerId ? String(customerId) : null,
          commas_subscription_id: subId ? String(subId) : null,
          note: "Commas payment",
          updated_at: new Date().toISOString(),
        });
        console.log(`commas-webhook: ${userId} -> pro for ${days} days (${type}).`);
        break;
      }

      /* Cancelled, refunded, or the subscription otherwise ended. The exact
         spelling is still not observed, so this matches the family rather
         than a literal. */
      case /^subscription\.(cancell?ed|ended|expired|deleted)$/i.test(type):
      case /^(payment|charge)\.(refunded|disputed|chargeback)$/i.test(type): {
        /* No cancellation event has ever been seen, so unlike the paid branch
           above these stay multi-spelling on purpose — there is nothing to
           collapse them to. The bare "id" is still dropped, because storing
           or matching a payment id as a subscription id is wrong whether or
           not the event has been observed. */
        const subId = pick(data, "subscription.id", "subscription_id");
        const customerId = pick(data, "buyer.id", "customer_id", "customer.id");
        const direct = String(
          pick(data, "api_metadata.data.user_id", "api_metadata.user_id",
               "metadata.user_id", "metadata.userId") ?? "",
        );

        let userId = direct;
        let onRecord: string | null = null;
        if (!userId && subId) {
          const acc = await accountForRef("commas_subscription_id", String(subId));
          if (acc) { userId = acc.userId; onRecord = acc.subId; }
        }
        if (!userId && customerId) {
          const acc = await accountForRef("commas_customer_id", String(customerId));
          if (acc) { userId = acc.userId; onRecord = acc.subId; }
        }
        if (!userId) {
          console.warn(`commas-webhook: no account matches ${type}; ignoring.`);
          break;
        }

        /* Is this event about the subscription this account is on? With two
           subscriptions on one customer, cancelling either looks identical
           from here, and the account would be switched off while the other
           kept charging. */
        if (onRecord && subId && String(subId) !== onRecord) {
          console.warn(
            `commas-webhook: ${type} for ${subId}, but ${userId} is on ${onRecord}. Leaving their plan alone.`,
          );
          break;
        }

        await upsertEntitlement({
          user_id: userId,
          plan: "free",
          expires_at: null,
          note: `Commas ${type}`,
          updated_at: new Date().toISOString(),
        });
        console.log(`commas-webhook: ${userId} -> free (${type}).`);
        break;
      }

      default:
        /* Logged rather than ignored, because the remaining event names are
           guesses. An unhandled event that should have granted premium is
           silent otherwise, and this is how we find out. Acknowledged so
           Commas does not mark the endpoint unhealthy. */
        console.log(`commas-webhook: unhandled event "${type}":`, JSON.stringify(event).slice(0, 2000));
        break;
    }

    return json({ received: true });
  } catch (e) {
    /* A 500 asks for a redelivery, which is right for a transient database
       failure — the alternative is a payment that silently grants nothing. */
    console.error("commas-webhook: handler failed:", String(e).slice(0, 500));
    return json({ error: "Handler failed." }, 500);
  }
});
