-- Chat messages are kept for 90 days, then deleted.
--
-- `companion_messages` is the verbatim transcript of what a person typed to
-- their pet, and nothing needs it for long: the pet reads only the last few
-- turns (MAX_TURNS), the chat screen shows the last 50, and everything worth
-- keeping longer has already been distilled into `companion_memories`, which
-- the person can see and delete from Settings. Usage caps look back 24 hours,
-- and the relationship summary counts messages from `companion_events`
-- (USER_SENT_MESSAGE), which this leaves alone. So old messages are only a
-- privacy liability, and they go.
--
-- ONLY MESSAGES. Memories, state and events are untouched.
--
-- The 90 days lives in one place: `prune_companion_messages` below. The daily
-- job just calls it, so changing the window is a `create or replace` of that
-- function, with no rescheduling.
--
-- SCHEDULED WITH pg_cron. If the extension cannot be enabled here (a local
-- stack without it, a plan that lacks it), the migration does not fail: the
-- function is still created and a warning is raised, and the job must be
-- scheduled by hand once pg_cron is on (Dashboard -> Database -> Extensions),
-- by re-running the `do` block at the bottom. Check it exists with:
--   select jobid, jobname, schedule, command, active from cron.job
--   where jobname = 'companion-messages-90-days';
-- and that it is running with:
--   select * from cron.job_run_details where jobid = <that jobid>
--   order by start_time desc limit 5;

create or replace function public.prune_companion_messages()
returns integer
language sql
set search_path = public
as $$
  -- No index leads with created_at (both start with user_id), so this scans.
  -- Once a day that is fine, and an index for it would tax every message sent.
  with gone as (
    delete from public.companion_messages
    where created_at < now() - interval '90 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- Housekeeping, not an API: no client may call it (functions in `public` are
-- otherwise reachable over PostgREST). pg_cron runs it as the job's owner.
revoke all on function public.prune_companion_messages() from public, anon, authenticated;
grant execute on function public.prune_companion_messages() to service_role;

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise warning 'pg_cron is not available (%); companion messages will NOT be pruned until it is enabled and this job is scheduled', sqlerrm;
    return;
  end;

  -- Idempotent: any earlier job of this name is removed first, so re-running
  -- this never leaves two. (cron.schedule also upserts by name on pg_cron
  -- 1.3+, but saying it outright does not depend on the version.)
  if exists (select 1 from cron.job where jobname = 'companion-messages-90-days') then
    perform cron.unschedule('companion-messages-90-days');
  end if;

  -- Daily at 09:17 UTC: the small hours across the Americas, early morning in
  -- Europe. Off the hour, so it does not queue behind everyone else's jobs.
  perform cron.schedule(
    'companion-messages-90-days',
    '17 9 * * *',
    'select public.prune_companion_messages()'
  );
end;
$$;
