// ═══════════════════════════════════════════════════════════════
// supabase/functions/delete-account/index.ts
//
// Deletes the signed-in user's account and everything belonging to it.
//
// verify_jwt is ON. The account deleted is always the one in the token —
// this function never takes a user id from the caller, so there is no
// version of the request that can delete somebody else.
//
// Removing the auth user cascades to inventory, sales, watchlist and the
// profile row, because each of those has an on-delete-cascade foreign key
// to auth.users. The explicit deletes below are belt and braces: if a table
// ever loses its cascade, data still goes rather than quietly surviving a
// deletion the person asked for.
//
// Deploy:  supabase functions deploy delete-account
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    /* Who is asking. The gateway has already verified this token's signature
       before the function runs; reading the subject out of it is how we know
       whose account to delete. A caller cannot name a different one. */
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
    if (!token) return json({ error: "Sign in again, then try." }, 401);

    /* Asking the auth server rather than trusting the claims blindly — this
       is a destructive, irreversible action and it is worth the round trip
       to be certain the token is live and whose it is. */
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return json({ error: "Your session has expired. Sign in again, then try." }, 401);
    const me = await meRes.json();
    const userId = me?.id;
    if (!userId) return json({ error: "Couldn't identify your account." }, 401);

    const admin = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    /* Data first, account second. In this order a failure part-way leaves an
       account whose data is gone, which the person can retry. The other
       order could leave orphaned rows with no way to reach them. */
    for (const table of ["inventory", "sales", "watchlist"]) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: "DELETE",
        headers: { ...admin, Prefer: "return=minimal" },
      });
      if (!res.ok) {
        console.error(`delete-account: ${table} delete failed`, res.status, (await res.text()).slice(0, 200));
        return json({ error: "Couldn't delete everything. Nothing was removed — try again." }, 500);
      }
    }
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "DELETE",
      headers: { ...admin, Prefer: "return=minimal" },
    });

    const gone = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: admin,
    });
    if (!gone.ok) {
      console.error("delete-account: auth user delete failed", gone.status, (await gone.text()).slice(0, 200));
      return json({ error: "Your data was removed but the account itself could not be closed. Contact support." }, 500);
    }

    console.log("delete-account: account and data removed.");
    return json({ ok: true });
  } catch (error) {
    console.error("delete-account error:", String(error));
    return json({ error: "Couldn't delete your account. Please try again." }, 500);
  }
});
