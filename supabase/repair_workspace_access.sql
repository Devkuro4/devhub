-- Dev Hub workspace repair
-- Safe to re-run. It creates missing state tables and restores authenticated access.
-- Existing profiles, roles and workspace data are preserved.

create table if not exists public.member_state (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_state (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

create table if not exists public.server_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.member_state enable row level security;
alter table public.shared_state enable row level security;
alter table public.server_state enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

drop policy if exists "own state read" on public.member_state;
create policy "own state read" on public.member_state for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "own state insert" on public.member_state;
create policy "own state insert" on public.member_state for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own state update" on public.member_state;
create policy "own state update" on public.member_state for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "shared read" on public.shared_state;
create policy "shared read" on public.shared_state for select to authenticated using (true);

drop policy if exists "shared insert" on public.shared_state;
create policy "shared insert" on public.shared_state for insert to authenticated
  with check (
    public.is_admin()
    or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster')
  );

drop policy if exists "shared update" on public.shared_state;
create policy "shared update" on public.shared_state for update to authenticated
  using (
    public.is_admin()
    or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster')
  )
  with check (
    public.is_admin()
    or key not in ('quizzes','weeklyActivities','presentations','resources','teamRoster')
  );

grant select, insert, update on public.member_state to authenticated;
grant select, insert, update on public.shared_state to authenticated;

revoke all on public.server_state from anon, authenticated;

select
  to_regclass('public.member_state') as member_state,
  to_regclass('public.shared_state') as shared_state,
  to_regclass('public.server_state') as server_state;
