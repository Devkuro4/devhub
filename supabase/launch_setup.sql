-- ONE-STEP DATABASE SETUP FOR LAUNCH.
-- Supabase > SQL Editor > New query > paste ALL of this > Run. Safe to run again.
-- It (1) creates/updates the tables and security rules, then (2) removes the old pretend sample data.
-- Afterwards, make yourself admin with the one line at the very bottom (use your email).

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

grant select, insert, update on public.member_state to authenticated;

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

grant select, insert, update on public.shared_state to authenticated;

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


-- ===================== Remove old pretend sample data =====================
-- Removes the old pretend sample data (made-up people, posts, events) from a LIVE database.
-- Safe to run more than once. Run in Supabase: SQL Editor > New query > paste > Run.
--
-- What it does NOT touch: anything a real member wrote. A sample item is removed only when it carries one of
-- the sample ids AND was written by one of the pretend people AND no real member has replied to it.
-- Starter links, quizzes and challenges stay (challenges are only reset to "Not Started").
-- It also clears the sample progress that older versions saved into member accounts, but only where that
-- progress is still exactly the sample (nothing the member changed).

do $$
declare
  fake text[] := array['Amara Okafor','Tunde Bakare','Chidinma Eze','Kwame Boateng','David Mensah'];
begin
  -- posts (replies are in "comments")
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (
      e->>'id' in ('post-1','post-2','post-3')
      and e->>'author' = any(fake)
      and not exists (select 1 from jsonb_array_elements(coalesce(e->'comments','[]'::jsonb)) c where not (c->>'author' = any(fake)))
    )), '[]'::jsonb)
  where key = 'posts' and jsonb_typeof(value) = 'array';

  -- help requests (replies are in "responses")
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (
      e->>'id' = 'help-1'
      and e->>'author' = any(fake)
      and not exists (select 1 from jsonb_array_elements(coalesce(e->'responses','[]'::jsonb)) c where not (c->>'responder' = any(fake)))
    )), '[]'::jsonb)
  where key = 'helpRequests' and jsonb_typeof(value) = 'array';

  -- showcase projects
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (e->>'id' in ('sc-1','sc-2') and e->>'author' = any(fake))
    ), '[]'::jsonb)
  where key = 'showcaseProjects' and jsonb_typeof(value) = 'array';

  -- events
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (e->>'id' in ('pres-1','pres-2') and e->>'presenter' = any(fake))
    ), '[]'::jsonb)
  where key = 'presentations' and jsonb_typeof(value) = 'array';

  -- team projects: only the sample project, and only if every member is a pretend person
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (
      e->>'id' = 'proj-1'
      and not exists (select 1 from jsonb_array_elements_text(coalesce(e->'members','[]'::jsonb)) m where not (m = any(fake)))
    )), '[]'::jsonb)
  where key = 'projects' and jsonb_typeof(value) = 'array';

  -- roster entries that are pretend people
  update public.shared_state set value = coalesce((
    select jsonb_agg(e) from jsonb_array_elements(value) e
    where not (e->>'id' in ('tm-1','tm-2','tm-3','tm-4','tm-5') and e->>'name' = any(fake))
    ), '[]'::jsonb)
  where key = 'teamRoster' and jsonb_typeof(value) = 'array';

  -- starter resources stay; only the made-up "added by" names are replaced
  update public.shared_state set value = coalesce((
    select jsonb_agg(case when e->>'addedBy' = any(fake) then jsonb_set(e, '{addedBy}', '"Dev Hub"') else e end)
    from jsonb_array_elements(value) e
    ), '[]'::jsonb)
  where key = 'resources' and jsonb_typeof(value) = 'array';

  -- leaderboard: remove pretend rows
  update public.shared_state set value = coalesce((
    select jsonb_object_agg(k, v) from jsonb_each(value) as t(k, v)
    where not (k in ('tm-1','tm-2','tm-3','tm-4') and v->>'name' = any(fake))
    ), '{}'::jsonb)
  where key = 'leaderboard' and jsonb_typeof(value) = 'object';

  -- challenges: the sample "Completed" challenge with a made-up submission goes back to Not Started
  update public.shared_state set value = coalesce((
    select jsonb_agg(
      case when e->'submission'->>'repoUrl' like '%amara-okafor-dev%'
           then jsonb_set(jsonb_set(e, '{status}', '"Not Started"'), '{submission}', 'null'::jsonb)
           else e end)
    from jsonb_array_elements(value) e
    ), '[]'::jsonb)
  where key = 'challenges' and jsonb_typeof(value) = 'array';

  -- member accounts: drop sample records that older versions saved, only where still exactly as the sample
  update public.member_state set state = jsonb_set(state, '{quizAttempts}', coalesce((
    select jsonb_agg(e) from jsonb_array_elements(state->'quizAttempts') e
    where not (e->>'id' = 'att-1' and e->>'quizTitle' = 'Everyday Web Basics: HTML, CSS & JavaScript' and e->>'date' = 'Nov 12, 2026' and e->>'score' = '2')
    ), '[]'::jsonb))
  where jsonb_typeof(state->'quizAttempts') = 'array';

  update public.member_state set state = jsonb_set(state, '{codeSubmissions}', coalesce((
    select jsonb_agg(e) from jsonb_array_elements(state->'codeSubmissions') e
    where not (e->>'id' = 'sub-1' and e->>'exerciseTitle' = 'Responsive Profile Card' and e->>'createdAt' = 'Yesterday')
    ), '[]'::jsonb))
  where jsonb_typeof(state->'codeSubmissions') = 'array';

  update public.member_state set state = jsonb_set(state, '{pairingState}',
    '{"partnerName":"","partnerField":"","assignedMentor":"","joinedGroups":[],"pairExercise":""}'::jsonb)
  where state->'pairingState'->>'partnerName' = 'Tunde Bakare' and state->'pairingState'->>'assignedMentor' = 'David Mensah';
end $$;

-- Finally, after you have signed up on the site, run this separately with your email:
-- update public.profiles set role = 'admin' where email = 'you@example.com';
