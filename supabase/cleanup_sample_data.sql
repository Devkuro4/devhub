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
