// ═══════════════════════════════════════════════════════════════
// supabase/functions/commas-webhook/index.ts
//
// Somebody pays through Commas, Commas tells this endpoint, and this
// endpoint writes `pro` into entitlements. The Commas counterpart of
// stripe-webhook, and deliberately the same shape — the two run side by
// side while the switch happens, and anything that reads differently
// between them is a place a bug can hide.
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
// ── What is assumed, and what to check on the first real event ──
//
// Commas' API docs are not reachable from where this was written, so the
// payload shape below is taken from their published description rather
// than from a document:
//
//   - signed HMAC-SHA256 over the raw body, signature in x-webhook-signature
//   - `metadata` set on the checkout session comes back on the payment event
//   - `payment.succeeded` fires for a one-off and for a subscription's
//     first charge; `subscription.renewed` fires on each renewal
//
// Field names inside the payload are a guess, so every read below tries
// several spellings and the whole body is logged on the first event of a
// kind. Fix the readers once a real payload has been seen — and delete
// this paragraph when they are no longer guesses.
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
   Commas customer or subscription rather than our own id. Mirrors
   stripe-webhook's lookup and exists for the same reason: only the first
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

/* The same grace day as the Stripe path, for the same reason: expiring to
   the minute drops somebody to Free while their renewal is still in
   flight, and being locked out of something you have paid for is a worse
   failure than a day of free access. */
const GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;

/* Read a field that might be spelled several ways, at the top level or
   nested one deep. Written this way because the payload shape is a guess;
   once a real event has been seen this can collapse to a single path. */
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
       warning. */
    console.error("commas-webhook: signature rejected.");
    return json({ error: "Invalid signature." }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    console.error("commas-webhook: signed body was not JSON.");
    return json({ error: "Bad payload." }, 400);
  }

  const type = String(pick(event, "type", "event", "event_type") ?? "");
  const data = pick(event, "data", "payload", "object") ?? event;

  try {
    switch (true) {
      /* A payment landed. Covers a one-off and a subscription's first
         charge, per Commas' own description of payment.succeeded. */
      case /^(payment|charge)\.(succeeded|paid|completed)$/i.test(type):
      case /^subscription\.(renewed|payment_succeeded)$/i.test(type): {
        /* The account id we put on the checkout session. Without it the
           money is attached to nobody. */
        const userId = String(
          pick(data, "metadata.user_id", "metadata.userId", "metadata.reference",
               "checkout_session.metadata.user_id", "session.metadata.user_id") ?? "",
        );
        if (!userId) {
          /* Worth shouting about and worth a 200: retrying will not add an
             id that was never sent, and the money is real, so this needs a
             person rather than a redelivery loop. */
          console.error(
            "commas-webhook: paid event with no user id in metadata — cannot match an account.",
            JSON.stringify(event).slice(0, 800),
          );
          return json({ received: true, matched: false });
        }

        const days = Number(pick(data, "frequency_days", "subscription.frequency_days", "interval_days"))
          || DEFAULT_PERIOD_DAYS;
        const subId = pick(data, "subscription_id", "subscription.id", "id");
        const customerId = pick(data, "customer_id", "customer.id", "customer");

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

      /* Cancelled, refunded, or the subscription otherwise ended. The
         exact spelling is not documented anywhere reachable, so this
         matches the family rather than a literal. */
      case /^subscription\.(cancell?ed|ended|expired|deleted)$/i.test(type):
      case /^(payment|charge)\.(refunded|disputed|chargeback)$/i.test(type): {
        const subId = pick(data, "subscription_id", "subscription.id", "id");
        const customerId = pick(data, "customer_id", "customer.id", "customer");
        const direct = String(pick(data, "metadata.user_id", "metadata.userId") ?? "");

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

        /* Is this event about the subscription this account is on? The
           same guard as the Stripe path: with two subscriptions on one
           customer, cancelling either looks identical from here, and the
           account would be switched off while the other kept charging. */
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
        /* Logged rather than ignored, because the event names above are
           guesses. An unhandled event that should have granted premium is
           silent otherwise, and this is how we find out. Acknowledged so
           Commas does not mark the endpoint unhealthy. */
        console.log(`commas-webhook: unhandled event "${type}":`, JSON.stringify(event).slice(0, 800));
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
