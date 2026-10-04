-- ai_calls prunes itself.
--
-- Rows older than 24 hours are never read again (every count looks back one
-- day), so `claim_ai_call` now deletes anything over two days old on roughly
-- one call in a hundred. No cron job to set up; the table stays at about two
-- days of rows however long the app runs. The delete uses the created_at
-- index, so it is cheap, and it rides inside the claim's own transaction.

create or replace function public.claim_ai_call(
  p_user uuid,
  p_kind text,
  p_user_limit integer,
  p_global_limit integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - interval '24 hours';
  used integer;
  everyone integer;
begin
  -- Serialises this user's claims of this kind, so simultaneous requests queue
  -- here and each one sees the rows the ones before it wrote.
  perform pg_advisory_xact_lock(hashtext('ai_call:' || p_user::text || ':' || p_kind));

  select count(*) into used
  from ai_calls
  where user_id = p_user and kind = p_kind and created_at >= since;
  if used >= p_user_limit then
    return 'user_limit';
  end if;

  -- The whole app's ceiling. Not locked across users, so a burst can pass it by
  -- a handful; it bounds the bill, it is not an exact count.
  select count(*) into everyone from ai_calls where created_at >= since;
  if everyone >= p_global_limit then
    return 'global_limit';
  end if;

  insert into ai_calls (user_id, kind) values (p_user, p_kind);

  -- Housekeeping, now and then.
  if random() < 0.01 then
    delete from ai_calls where created_at < now() - interval '2 days';
  end if;

  return 'ok';
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, integer, integer) to service_role;
