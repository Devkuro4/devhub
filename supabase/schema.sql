-- Run this in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run (idempotent).

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  email text,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'member';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.member_state (            -- each member's private progress
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_state (            -- community data: posts, help requests, resources...
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.member_state enable row level security;
alter table public.shared_state enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- create a profile automatically when someone signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- profiles: everyone signed in can see names; people can edit only their own name, never their role
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Members can see each other's names, but not each other's email addresses.
-- (Admins find emails in Supabase, Authentication, Users. The app never reads the email column.)
revoke select on public.profiles from authenticated;
grant select (id, full_name, role, created_at) on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- member_state: private to the owner, readable by admins
drop policy if exists "own state read" on public.member_state;
create policy "own state read" on public.member_state for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own state insert" on public.member_state;
create policy "own state insert" on public.member_state for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own state update" on public.member_state;
create policy "own state update" on public.member_state for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- shared_state: everyone reads; members write community keys; only admins write the curated ones
drop policy if exists "shared read" on public.shared_state;
create policy "shared read" on public.shared_state for select to authenticated using (true);

drop policy if exists "shared insert" on public.shared_state;
create policy "shared insert" on public.shared_state for insert to authenticated
  with check (public.is_admin() or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster'));

drop policy if exists "shared update" on public.shared_state;
create policy "shared update" on public.shared_state for update to authenticated
  using (public.is_admin() or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster'))
  with check (public.is_admin() or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_state'
  ) then
    alter publication supabase_realtime add table public.shared_state;   -- live updates between members
  end if;
end $$;

-- Backfill profiles for any users who signed up before this schema ran
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- After you sign up yourself, make yourself the admin (use your email):
-- update public.profiles set role = 'admin' where email = 'you@example.com';


-- ---------------------------------------------------------------------------
-- OPTIONAL: only let your team sign up (recommended before sharing the link).
-- Easiest option, no SQL: Supabase > Authentication > Sign In / Providers >
-- turn OFF "Allow new users to sign up", then add people yourself with
-- Authentication > Users > Add user > Send invitation.
--
-- Or restrict sign-up to one email domain. Edit the domain, then remove the leading "-- ":
--
-- create or replace function public.only_team_emails() returns trigger
-- language plpgsql security definer set search_path = public as $$
-- begin
--   if new.email is null or lower(new.email) not like '%@yourcompany.com' then
--     raise exception 'Sign-ups are limited to the team.';
--   end if;
--   return new;
-- end $$;
-- drop trigger if exists only_team_emails_trg on auth.users;
-- create trigger only_team_emails_trg before insert on auth.users
--   for each row execute function public.only_team_emails();
-- ---------------------------------------------------------------------------
