# Granting and removing premium by hand

There is no admin screen, deliberately: the only thing that can make an
account premium is a row in `entitlements`, and the only thing that can write
that row is the service role. Nothing a browser does can promote an account.

Run everything here in the Supabase **SQL Editor**.

## The short way

Two functions, installed by `supabase/migrations/002_premium_helpers.sql`:

```sql
select grant_premium('them@example.com');        -- one year
select grant_premium('them@example.com', 30);    -- thirty days
select grant_premium('them@example.com', null);  -- no expiry
select revoke_premium('them@example.com');
```

Each returns one sentence saying what happened, and **the sentence names the
account as stored, not what you typed**. That is the point of them. The raw
statements further down fail silently on a typo — they match nobody, change
nothing, and print success, which is exactly the mistake people make when
fixing an account in a hurry. These say `No account with the address …`
instead. The address is matched ignoring case and surrounding spaces.

`revoke_premium` also warns you when the person still has a live
subscription recorded, because clearing the row does not stop the
processor from billing them. See **Removing premium** below — that ordering
matters more than anything else on this page.

Only `service_role` and the SQL Editor may call these. Postgres grants
`EXECUTE` to `PUBLIC` by default, and `PUBLIC` includes the roles a browser
holds, so the migration revokes it — without that, any signed-in visitor
could promote themselves. Revoking from `anon` and `authenticated` alone
would not have been enough; the grant lives on `PUBLIC` and they inherit it.

## The long way

Useful when you want to see or change exactly what is written.

## Grant

```sql
insert into public.entitlements (user_id, plan, activated_at, expires_at, note, updated_at)
select id, 'pro', now(), now() + interval '1 year', 'Comped by owner', now()
from auth.users
where email = 'them@example.com'
on conflict (user_id) do update
  set plan         = 'pro',
      activated_at = coalesce(public.entitlements.activated_at, now()),
      expires_at   = excluded.expires_at,
      note         = excluded.note,
      updated_at   = now()
returning user_id, plan, expires_at;
```

Safe to run twice — `on conflict` updates the existing row rather than
failing, so it works whether or not the account has ever had a plan.

**Read the `returning` line.** A row printed means it worked. Nothing printed
means the address matched no account and you have changed nothing. SQL will
not tell you that any other way, and it is the mistake that actually happens:
a typo in the address looks identical to success.

`activated_at` is preserved by `coalesce` so an extension doesn't rewrite the
date somebody first subscribed.

- **No expiry:** `null` instead of `now() + interval '1 year'`. The app treats
  a null `expires_at` as forever.
- **Other lengths:** `interval '30 days'`, `interval '6 months'`.

## Removing premium

**Read this before revoking anyone who has actually paid.**

Clearing the row does not stop the processor. If the subscription is still
live, the next renewal event writes `pro` straight back and your revoke
silently undoes itself — hours later, with nothing in the database
explaining why. Cancelling with the processor is the real revoke.

**Someone who pays.** Cancel in the Commas dashboard and stop: find them by
email and cancel the subscription there. The webhook receives
`subscription.canceled` and sets them to free by itself. No SQL at all. If
you want it gone immediately rather than on the event, cancel first,
then run `revoke_premium`.

**A comped or test account.** No subscription exists, so the row is the only
place their premium lives:

```sql
select revoke_premium('them@example.com');
```

or the raw form:

```sql
update public.entitlements
set plan = 'free', expires_at = null, note = 'Revoked', updated_at = now()
where user_id = (select id from auth.users where email = 'them@example.com')
returning user_id, plan;
```

### How fast it takes effect

Instantly in the database, and instantly for anyone who reloads the page,
signs in, or opens the app fresh.

Someone sitting in an **already-open tab keeps the premium interface until
they refresh**. The app rechecks the plan when you switch back to the tab,
but that recheck only ever promotes — a paying customer must not be knocked
down to Free because their connection blinked, and that protection cuts both
ways. They cannot get anything expensive out of it: `ai-assistant`,
`product-search` and `market-research` each re-read the database on every
call, so the spending stops at once even while the interface lags.

## Who has what

```sql
select u.email, p.username, coalesce(e.plan, 'free') as plan, e.expires_at, e.note
from auth.users u
left join public.profiles p on p.id = u.id
left join public.entitlements e on e.user_id = u.id
order by u.created_at;
```

## Tell the person to refresh

The plan is read when they sign in, so a grant does not appear under their
feet. They press **Settings → "I've paid, check again"**, or sign out and back
in. Without that they still see Free and report that it did not work.

That button renews the access token before asking, which matters: the token
was minted before the grant, and an expired one gets refused by the gateway —
which would otherwise surface as "still free" rather than as a stale session.

## This is no longer the only route

`supabase/functions/commas-webhook` now writes these same rows
automatically on `payment.succeeded`, and sets `plan = 'free'` when a
subscription is cancelled or refunded. Everything here is still correct and
still used — for comped accounts, for support fixes, and for the times an
event has not landed.

Stripe was the processor before Commas and is gone: its links are
deactivated and every subscription on that account is cancelled. A row
carrying `stripe_subscription_id` is history, not something still being
billed.

The expiry is the backstop in both cases: it is set from the paid period, so
premium lapses on its own even if a cancellation event is missed entirely.
Grants made by hand are the same shape as grants made by the webhook, which
is why the two never conflict.
