-- Every paid AI call (Claude, Gemini) is claimed here first, atomically.
--
-- The daily caps used to be "count today's rows, then call the model, then
-- write the row". Requests fired at the same moment all read the same count
-- before any of them wrote, so a script sending 200 chats at once had all 200
-- answered on a cap of 10. And a meal photo with no food in it was never
-- written at all, so it never counted.
--
-- `claim_ai_call` takes a per-user lock, counts the user's calls of that kind
-- in the last 24 hours, checks the whole app's calls against a global ceiling,
-- and records the call -- all in one transaction. The record is written BEFORE
-- the model is called, so every attempt counts, whatever it returns.

create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'chat', 'proactive', 'meal_photo', 'push_lines'
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_calls_user_kind_time on public.ai_calls (user_id, kind, created_at desc);
create index if not exists ai_calls_time on public.ai_calls (created_at);

-- Server-only: RLS on and no policies, so no client can read or write it.
alter table public.ai_calls enable row level security;

-- 'ok', 'user_limit' or 'global_limit'.
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
  return 'ok';
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, integer, integer) to service_role;

-- Rows older than a day are never read again; 20261004120000 has the claim
-- prune them automatically.
