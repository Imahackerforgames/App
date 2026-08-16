-- ═══════════════════════════════════════════════════════════════
-- 001_auth_setup.sql
-- Profiles table + auto-create trigger + Row Level Security.
-- Run this ONCE. Safe to re-run (everything is idempotent).
--
-- This handles the database side only. Enabling Email and Google
-- as sign-in methods happens in the Supabase dashboard under
-- Authentication → Providers — it isn't SQL.
-- ═══════════════════════════════════════════════════════════════

-- ---------- 1. profiles table ----------
-- Keyed directly to auth.users. ON DELETE CASCADE means deleting the
-- auth user cleans up the profile automatically — no orphan rows.

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  state      text,
  zip        text,
  radius     int     not null default 25,
  theme      text    not null default 'heat',
  onboarded  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 2. auto-create a profile on signup ----------
-- SECURITY DEFINER lets this insert into a table the new user can't yet
-- touch. `set search_path = ''` is deliberate: without it, a mutable
-- search_path on a SECURITY DEFINER function is a real privilege-
-- escalation risk, and Supabase's own linter flags it. The cost is that
-- every reference below must be fully qualified.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',   -- Google supplies this
      new.raw_user_meta_data ->> 'name',
      ''                                         -- email signup supplies neither
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. Row Level Security ----------
-- Without this, ANY signed-in user can read EVERY profile. This is the
-- single most important block in the file.

alter table public.profiles enable row level security;

drop policy if exists "own profile: select" on public.profiles;
create policy "own profile: select"
  on public.profiles for select
  using ( (select auth.uid()) = id );

drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update"
  on public.profiles for update
  using      ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

drop policy if exists "own profile: insert" on public.profiles;
create policy "own profile: insert"
  on public.profiles for insert
  with check ( (select auth.uid()) = id );

-- Note on two choices above:
--
-- `(select auth.uid())` rather than bare `auth.uid()` — wrapping it in a
-- subquery lets Postgres evaluate it once per statement instead of once
-- per row. On a large table that's a large difference.
--
-- No DELETE policy exists on purpose. Users shouldn't delete their profile
-- directly; deleting the auth.users row cascades and removes it. Add one
-- later only if you build real account deletion.

-- ═══════════════════════════════════════════════════════════════
-- HOW TO VERIFY RLS ACTUALLY WORKS
--
-- ⚠️  The Supabase SQL editor runs as an admin role that BYPASSES RLS.
--     Running `select * from profiles` there returns every row even when
--     your policies are perfect. That is not a bug and not a failure —
--     it's the single most common reason people think RLS is broken.
--
-- To test properly, impersonate a user inside a transaction:

/*
begin;
  -- paste a real user's UUID from Authentication → Users
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', 'PASTE-USER-B-UUID-HERE')::text,
    true
  );
  set local role authenticated;

  -- Should return EXACTLY ONE row: user B's own profile.
  -- If it returns every profile, RLS is not working — stop and fix it.
  select id, name from public.profiles;
rollback;
*/

-- Or test from outside the database entirely, with a real user's token:
--
--   curl "https://<PROJECT-REF>.supabase.co/rest/v1/profiles?select=*" \
--     -H "apikey: <ANON_KEY>" \
--     -H "Authorization: Bearer <USER_B_ACCESS_TOKEN>"
--
-- Same expectation: one row, theirs.
-- ═══════════════════════════════════════════════════════════════
