-- Two fixes from the security review.
--
-- 1. Old care-partner invite codes. Before 20261004130000 the app chose an
--    invite's expiry itself, so some codes were made to last far longer than a
--    week; that migration added the 8-day bound as NOT VALID, which left those
--    rows alone. Every invite now ends at most a week after it was made (the
--    lifetime create_pet_invite gives), which expires the long-lived ones at
--    once, and the bound is then enforced for every row.
--
-- 2. Finding and adding people. `search_profiles` answered two-letter
--    prefixes, enough to page through every username in the app; it now needs
--    three. And friend requests had no limit: a request declined, or cancelled,
--    could simply be sent again, forever. Twenty sends a day each now, counted
--    in a log of their own so cancelling a request does not give it back.

-- 1. Invite codes ------------------------------------------------------------

update public.pet_invites
set expires_at = created_at + interval '7 days'
where expires_at > created_at + interval '8 days';

alter table public.pet_invites validate constraint pet_invites_expiry_bound;

-- 2a. Username search ---------------------------------------------------------

create or replace function public.search_profiles(search_query text)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    case
      when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
      else p.display_name
    end
  from public.profiles p
  where p.username is not null
    -- Escape LIKE wildcards in the caller-supplied query so '%'/'_' search for
    -- themselves literally rather than broadening the match.
    and p.username ilike replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    and p.id <> auth.uid()
    -- Three letters, not two: two-letter prefixes paged through every username.
    and length(btrim(search_query)) >= 3
  order by p.username
  limit 20;
$$;

-- 2b. Friend requests: twenty a day ------------------------------------------

-- Every request ever sent, newest day kept; server-only (RLS on, no policies).
create table if not exists public.friend_request_sends (
  requester_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists friend_request_sends_requester_time
  on public.friend_request_sends (requester_id, created_at desc);
alter table public.friend_request_sends enable row level security;

create or replace function public.limit_friend_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sent integer;
begin
  -- One at a time per sender, so a burst cannot all read the same count.
  perform pg_advisory_xact_lock(hashtext('friend_requests:' || new.requester_id::text));
  delete from friend_request_sends
  where requester_id = new.requester_id and created_at < now() - interval '24 hours';
  select count(*) into sent from friend_request_sends where requester_id = new.requester_id;
  if sent >= 20 then
    raise exception 'You''ve sent a lot of friend requests today. Try again tomorrow.'
      using errcode = 'P0001';
  end if;
  insert into friend_request_sends (requester_id) values (new.requester_id);
  return new;
end;
$$;

revoke all on function public.limit_friend_requests() from public, anon, authenticated;

drop trigger if exists friend_requests_daily_limit on public.friend_requests;
create trigger friend_requests_daily_limit
  before insert on public.friend_requests
  for each row execute function public.limit_friend_requests();
