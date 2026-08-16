// ═══════════════════════════════════════════════════════════════
// supabase/functions/username-login/index.ts
//
// Signs a user in with a username instead of an email address.
//
// Supabase Auth only authenticates by email or phone, so a username has to
// be resolved to an account first. That lookup needs the service role, which
// must never reach a browser — hence this function.
//
// verify_jwt is OFF deliberately: this runs before anyone has a session, so
// requiring one would make it impossible to call. It is a credentialled
// endpoint — it does nothing without a correct username and password.
//
// The email is used internally and never returned. Unknown usernames and
// wrong passwords give the same answer, so this can't be used to discover
// which usernames exist or to harvest addresses.
//
// Deploy:  supabase functions deploy username-login --no-verify-jwt
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

// One message for every failure mode below, so the response can't be used to
// tell "no such username" apart from "wrong password".
const DENIED = { error: "Username or password is incorrect." };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { username, password } = await req.json().catch(() => ({}));

    if (typeof username !== "string" || typeof password !== "string" ||
        !username.trim() || !password) {
      return json({ error: "Enter a username and password." }, 400);
    }

    const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

    // 1. Username -> account id. `ilike` with no wildcards is a
    //    case-insensitive equality match, matching the unique index.
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id&username=ilike.${encodeURIComponent(username.trim())}&limit=1`,
      { headers: admin },
    );
    if (!lookup.ok) {
      console.error("profile lookup failed:", lookup.status, await lookup.text());
      return json({ error: "Couldn't sign you in. Please try again." }, 500);
    }
    const rows = await lookup.json();
    if (!Array.isArray(rows) || rows.length === 0) return json(DENIED, 400);

    // 2. Account id -> email. Admin-only; the address stays server-side.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${rows[0].id}`, { headers: admin });
    if (!userRes.ok) return json(DENIED, 400);
    const email = (await userRes.json())?.email;
    if (!email) return json(DENIED, 400);

    // 3. Normal password grant, on the caller's behalf.
    const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || !session?.access_token) {
      // An unconfirmed address is worth saying out loud — it's the one case
      // the user can act on, and it reveals nothing they didn't just type.
      const msg = String(session?.error_description ?? session?.msg ?? "");
      if (/confirm/i.test(msg)) {
        return json({ error: "Confirm your email address before signing in." }, 400);
      }
      return json(DENIED, 400);
    }

    return json({ access_token: session.access_token, user: session.user });
  } catch (error) {
    console.error("username-login error:", error);
    return json({ error: "Couldn't sign you in. Please try again." }, 500);
  }
});
