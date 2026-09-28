/* The premium helper functions, checked as source.

   There is no database in this harness, so this reads the migration rather
   than running it. That is enough, because the thing worth guarding here is
   not behaviour — it is a single property that is invisible when it breaks.

   grant_premium is SECURITY DEFINER, so it runs with its owner's rights no
   matter who calls it. Postgres grants EXECUTE on a new function to PUBLIC
   by default, and PUBLIC includes `anon` and `authenticated` — the two roles
   any visitor holds with nothing but the publishable key. Delete one line
   from that migration and every signed-in user can promote themselves to
   premium, with no error, no log, and nothing on screen to show for it.

   So: these assertions exist to make that deletion fail loudly. */
import { readFileSync } from "fs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  PASS  " + n)) : (fail++, console.log("  FAIL  " + n + (x ? "  <- " + x : ""))); };

const sql = readFileSync("/home/user/App/supabase/migrations/002_premium_helpers.sql", "utf8");
/* Comments explain the reasoning at length and mention these role names, so
   matching against the raw file would pass on prose alone. Strip them. */
const code = sql.replace(/^\s*--.*$/gm, "");

const FNS = [
  ["grant_premium", /grant_premium\s*\(\s*text\s*,\s*int\s*\)/],
  ["revoke_premium", /revoke_premium\s*\(\s*text\s*\)/],
];

console.log("\n1. Both functions exist");
for (const [name] of FNS) {
  ok(`${name} is defined`, new RegExp(`create or replace function public\\.${name}\\b`, "i").test(code));
}

/* ── 2. the one that matters ─────────────────────────────────────────────
   Revoking from anon and authenticated individually is NOT a substitute:
   the default grant lives on PUBLIC and those roles inherit it, so the
   function would stay callable. It has to be PUBLIC by name. */
console.log("\n2. EXECUTE is taken away from PUBLIC");
for (const [name, sig] of FNS) {
  const revoked = code.split("\n").some((l) =>
    /^\s*revoke\s+execute\s+on\s+function/i.test(l) && sig.test(l) && /\bfrom\s+public\b/i.test(l));
  ok(`${name}: revoked from PUBLIC`, revoked,
     "without this every signed-in visitor can call it");
}

console.log("\n3. And never handed to a role a browser holds");
for (const [name, sig] of FNS) {
  const granted = code.split("\n").filter((l) =>
    /^\s*grant\s+execute\s+on\s+function/i.test(l) && sig.test(l));
  ok(`${name}: granted to service_role`, granted.some((l) => /\bservice_role\b/.test(l)),
     JSON.stringify(granted));
  ok(`${name}: never granted to anon or authenticated`,
     !granted.some((l) => /\b(anon|authenticated)\b/.test(l)), JSON.stringify(granted));
}

/* ── 4. search_path ──────────────────────────────────────────────────────
   A SECURITY DEFINER function without a pinned search_path resolves its
   table names against whatever the caller's search_path says, so an
   unprivileged caller can point `entitlements` at a table of their own. */
console.log("\n4. SECURITY DEFINER, with search_path pinned");
for (const [name] of FNS) {
  const body = code.split(new RegExp(`create or replace function public\\.${name}`, "i"))[1] || "";
  const head = body.split("as $$")[0] || "";
  ok(`${name}: security definer`, /security\s+definer/i.test(head), head.slice(0, 120));
  ok(`${name}: search_path pinned`, /set\s+search_path\s*=/i.test(head), head.slice(0, 120));
}

/* ── 5. the silent-failure problem these were written to solve ───────────
   A raw UPDATE with a typo'd address matches nobody and reports success.
   The whole reason for wrapping it is that these say so instead. */
console.log("\n5. A miss is reported, not silently ignored");
for (const [name] of FNS) {
  const body = (code.split(new RegExp(`create or replace function public\\.${name}`, "i"))[1] || "").split("$$;")[0];
  ok(`${name}: returns a message when no account matches`,
     /v_id\s+is\s+null/i.test(body) && /No account with the address/i.test(body));
  ok(`${name}: matches the address case- and space-insensitively`,
     /lower\(email\)\s*=\s*lower\(trim\(p_email\)\)/i.test(body));
}

/* ── 6. the trap that would undo a revoke ────────────────────────────────
   Clearing the row does not cancel anything at Stripe. If the subscription
   is live, the next renewal event writes `pro` straight back — hours later,
   with nothing in the database to explain it. The function has to say so. */
console.log("\n6. Revoking warns about a live Stripe subscription");
{
  const body = (code.split(/create or replace function public\.revoke_premium/i)[1] || "").split("$$;")[0];
  ok("reads the recorded subscription before overwriting the row",
     /stripe_subscription_id\s+into/i.test(body));
  ok("and says so in the returned message", /v_sub\s+is\s+not\s+null/i.test(body) && /Stripe/i.test(body));
  ok("naming what to do about it", /Cancel/i.test(body));
}

/* ── 7. a grant must not rewrite when somebody first subscribed ──────────
   activated_at is the only record of how long a person has been a customer.
   Extending them is not the same as them signing up again. */
console.log("\n7. Extending premium preserves the original start date");
{
  const body = (code.split(/create or replace function public\.grant_premium/i)[1] || "").split("$$;")[0];
  ok("activated_at is coalesced on conflict", /activated_at\s*=\s*coalesce/i.test(body), body.slice(0, 200));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
