-- DEV HUB: FULL PRE-LAUNCH RESET
--
-- This permanently deletes every Dev Hub account and all app data while keeping
-- the schema, RLS policies, triggers, quizzes/challenge templates in source code,
-- and environment configuration intact.
--
-- Run only in the intended Supabase project:
--   SQL Editor > New query > paste this file > replace the confirmation value > Run
--
-- After it succeeds, sign up again with the launch admin email and promote that
-- new profile to admin using the command in LAUNCH.md.

begin;

do $reset_guard$
declare
  confirmation text := 'CHANGE_ME_BEFORE_RUNNING';
begin
  if confirmation <> 'RESET_ALL_DEVHUB_DATA_FOR_TEAM_LAUNCH' then
    raise exception using
      message = 'Reset cancelled: confirmation value was not changed.',
      hint = 'Set confirmation to RESET_ALL_DEVHUB_DATA_FOR_TEAM_LAUNCH only after checking the Supabase project name.';
  end if;
end
$reset_guard$;

-- Server-owned competition, messaging, moderation, and imported-learning data.
delete from public.server_state;

-- Community posts, projects, events, resources, rosters, reports, and leaderboards.
-- This runs before deleting users because shared_state.updated_by references auth.users.
delete from public.shared_state;

-- Private learning progress, AI mentor history, submissions, and quiz attempts.
delete from public.member_state;

-- Public member directory data. Auth deletion below would also cascade this.
delete from public.profiles;

-- Accounts, identities, sessions, and refresh tokens. Profiles/member_state also
-- cascade from this table if any row was created during the reset transaction.
delete from auth.users;

commit;

-- A successful reset returns five zeroes. These checks are read-only.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.member_state) as member_state_rows,
  (select count(*) from public.shared_state) as shared_state_rows,
  (select count(*) from public.server_state) as server_state_rows;
