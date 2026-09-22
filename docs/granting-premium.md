# Granting premium by hand

Until a payment processor is wired up, `entitlements` is written by hand.
This is the whole of it — there is no admin screen, and deliberately so: the
only thing that can make an account premium is a row in this table, and the
only thing that can write that row is the service role. Nothing a browser
does can promote an account.

Run these in the Supabase **SQL Editor**.

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

## Revoke

```sql
update public.entitlements
set plan = 'free', expires_at = null, note = 'Revoked', updated_at = now()
where user_id = (select id from auth.users where email = 'them@example.com')
returning user_id, plan;
```

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

## When this goes away

Once a payment webhook exists, it writes these same rows on
`checkout.session.completed` and sets `plan = 'free'` on cancellation. The
expiry is the backstop: it is set from the paid period, so premium lapses on
its own even if a cancellation webhook is missed entirely. Grants made here
are the same shape, which is why comped accounts keep working afterwards.
