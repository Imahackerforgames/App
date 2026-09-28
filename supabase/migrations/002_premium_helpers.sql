-- ═══════════════════════════════════════════════════════════════
-- 002_premium_helpers.sql
-- grant_premium() and revoke_premium(): the by-hand premium controls,
-- reduced to one short call each.
--
-- Run this ONCE in the SQL Editor. Safe to re-run.
--
-- Why these exist. Granting and revoking were multi-line UPDATE and
-- INSERT ... ON CONFLICT statements pasted from a doc, and a typo in the
-- WHERE clause fails *silently* — it matches nobody, changes nothing, and
-- prints success. That is the mistake that actually happens, at speed,
-- when somebody is trying to fix an account in a hurry. These return a
-- sentence saying what happened instead.
-- ═══════════════════════════════════════════════════════════════

-- ---------- grant ----------
-- p_days null means no expiry. The app reads a null expires_at as forever.

create or replace function public.grant_premium(p_email text, p_days int default 365)
returns text
language plpgsql
security definer
-- A SECURITY DEFINER function runs as its owner, so an attacker-controlled
-- search_path could point `entitlements` at a table of their choosing. Pin it.
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_email text;
  v_exp   timestamptz;
begin
  -- Addresses are matched case- and whitespace-insensitively. Somebody
  -- typing a customer's address by hand should not be defeated by a
  -- capital letter or a trailing space copied out of an email client.
  --
  -- The address as *stored* comes back too, and every message below quotes
  -- that rather than what was typed. Echoing the input tells you what you
  -- asked for; echoing the account tells you who you hit, which is the
  -- thing you actually want confirmed before walking away.
  select id, email into v_id, v_email
  from auth.users where lower(email) = lower(trim(p_email));

  if v_id is null then
    return format('No account with the address %s. Nothing was changed.', p_email);
  end if;

  v_exp := case when p_days is null then null
                else now() + make_interval(days => p_days) end;

  insert into public.entitlements (user_id, plan, activated_at, expires_at, note, updated_at)
  values (v_id, 'pro', now(), v_exp, 'Granted by owner', now())
  on conflict (user_id) do update
    -- coalesce so extending somebody does not rewrite the date they first
    -- subscribed. That date is the only record of how long they have been
    -- a customer.
    set plan         = 'pro',
        activated_at = coalesce(public.entitlements.activated_at, now()),
        expires_at   = excluded.expires_at,
        note         = excluded.note,
        updated_at   = now();

  return format('%s now has premium until %s.',
                v_email, coalesce(v_exp::date::text, 'further notice (no expiry)'));
end;
$$;

-- ---------- revoke ----------

create or replace function public.revoke_premium(p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_email text;
  v_plan  text;
  v_sub   text;
begin
  select id, email into v_id, v_email
  from auth.users where lower(email) = lower(trim(p_email));

  if v_id is null then
    return format('No account with the address %s. Nothing was changed.', p_email);
  end if;

  -- Read the current state before overwriting it, so the message can be
  -- specific about what was actually taken away.
  select plan, stripe_subscription_id into v_plan, v_sub
  from public.entitlements where user_id = v_id;

  if v_plan is null or v_plan <> 'pro' then
    return format('%s did not have premium. Nothing was changed.', v_email);
  end if;

  update public.entitlements
  set plan = 'free', expires_at = null, note = 'Revoked by owner', updated_at = now()
  where user_id = v_id;

  -- The trap this function exists to make visible.
  --
  -- Clearing the row does not stop Stripe. If the subscription is still
  -- live, the next customer.subscription.updated event writes `pro` straight
  -- back and the revoke silently undoes itself — hours later, with nothing
  -- in the database to explain why. Cancelling in Stripe is the real
  -- revoke; this is only the immediate half of it.
  if v_sub is not null then
    return format(
      'Premium removed from %s — BUT their Stripe subscription %s is still recorded. '
      'Cancel it in Stripe (Customers -> their email -> Cancel subscription), or the '
      'next renewal event will give premium straight back.', v_email, v_sub);
  end if;

  return format('Premium removed from %s.', v_email);
end;
$$;

-- ---------- who may call these ----------
--
-- This is the part that matters, and the part that is easy to get wrong.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default. PUBLIC
-- includes `anon` and `authenticated` — the two roles a browser can reach
-- with nothing but the publishable key. Left alone, these functions would
-- let any visitor call grant_premium('their@email') and promote themselves,
-- because SECURITY DEFINER means the function runs with the owner's rights
-- rather than theirs.
--
-- Revoking from PUBLIC is therefore not tidying. It is the whole control.
-- Revoking from anon and authenticated individually would NOT be enough:
-- the grant lives on PUBLIC, and those roles inherit it.

revoke execute on function public.grant_premium(text, int)  from public;
revoke execute on function public.revoke_premium(text)      from public;
revoke execute on function public.grant_premium(text, int)  from anon, authenticated;
revoke execute on function public.revoke_premium(text)      from anon, authenticated;

-- service_role only: the SQL Editor and the Edge Functions, nothing a
-- browser holds a credential for.
grant execute on function public.grant_premium(text, int) to service_role;
grant execute on function public.revoke_premium(text)     to service_role;

-- ---------- how to use them ----------
--
--   select grant_premium('them@example.com');          -- one year
--   select grant_premium('them@example.com', 30);      -- thirty days
--   select grant_premium('them@example.com', null);    -- no expiry
--   select revoke_premium('them@example.com');
--
-- Each returns a sentence. Read it — it is the only confirmation, and it
-- distinguishes "done" from "that address matched nobody".
