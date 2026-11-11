-- Reporting and blocking, for what users show each other (usernames, bios,
-- pets, reactions). App Review guideline 1.2 asks for both wherever users can
-- publish to one another. Enforced here, not trusted to the app.
--
-- Blocking someone:
--   * ends any friendship or request between the two (the rows are deleted);
--   * stops new friend requests either way, and so reactions, which need a
--     friendship;
--   * hides each from the other in username search.
-- It is private: nothing tells the blocked person.
--
-- A report records who reported whom, why, and what the reported username and
-- bio said at that moment (they can change afterwards). Only the project owner
-- reads reports (Supabase dashboard, `user_reports`); users can file them but
-- never read them.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  -- Their username when blocked, so the blocked list can name them once the
  -- friendship (and with it any way to look them up) is gone.
  blocked_username text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "Users see their own blocks" on public.user_blocks;
create policy "Users see their own blocks" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "Users block as themselves" on public.user_blocks;
create policy "Users block as themselves" on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists "Users unblock their own blocks" on public.user_blocks;
create policy "Users unblock their own blocks" on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;

-- Either one has blocked the other.
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- The username is read here, not taken from the client.
create or replace function public.name_blocked_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.username into new.blocked_username from public.profiles p where p.id = new.blocked_id;
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.name_blocked_user() from public, anon, authenticated;

drop trigger if exists user_blocks_name on public.user_blocks;
create trigger user_blocks_name
  before insert on public.user_blocks
  for each row execute function public.name_blocked_user();

-- A block ends the friendship, and any request either way, at once.
create or replace function public.end_friendship_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friend_requests fr
  where (fr.requester_id = new.blocker_id and fr.addressee_id = new.blocked_id)
     or (fr.requester_id = new.blocked_id and fr.addressee_id = new.blocker_id);
  return new;
end;
$$;

revoke all on function public.end_friendship_on_block() from public, anon, authenticated;

drop trigger if exists user_blocks_end_friendship on public.user_blocks;
create trigger user_blocks_end_friendship
  after insert on public.user_blocks
  for each row execute function public.end_friendship_on_block();

-- No new request between two people while either has blocked the other. The
-- message does not say who blocked whom.
create or replace function public.refuse_blocked_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.blocked_between(new.requester_id, new.addressee_id) then
    raise exception 'You can''t send a friend request to this person.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_blocked_friend_request() from public, anon, authenticated;

-- Named to sort before friend_requests_daily_limit, so a refused request does
-- not use up one of the day's twenty.
drop trigger if exists friend_requests_a_blocked on public.friend_requests;
create trigger friend_requests_a_blocked
  before insert on public.friend_requests
  for each row execute function public.refuse_blocked_friend_request();

-- Username search, exactly as in 20261012130000 apart from leaving out anyone
-- either side has blocked.
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
    and p.username ilike replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
    and p.id <> auth.uid()
    and length(btrim(search_query)) >= 3
    and not public.blocked_between(auth.uid(), p.id)
  order by p.username
  limit 20;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('offensive_profile', 'harassment', 'spam', 'other')),
  details text check (details is null or char_length(details) <= 500),
  -- What they showed when reported, filled in by the trigger below.
  reported_username text,
  reported_bio text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists user_reports_open on public.user_reports (status, created_at desc);

alter table public.user_reports enable row level security;

-- File only, as yourself. No select policy: reports are read in the dashboard.
drop policy if exists "Users file reports as themselves" on public.user_reports;
create policy "Users file reports as themselves" on public.user_reports
  for insert to authenticated with check (reporter_id = auth.uid());

grant insert on public.user_reports to authenticated;

create table if not exists public.user_report_sends (
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists user_report_sends_reporter on public.user_report_sends (reporter_id, created_at desc);
alter table public.user_report_sends enable row level security;

-- Snapshots what was reported, keeps the status 'open' whatever the client
-- sent, and holds anyone to 20 reports a day.
create or replace function public.prepare_user_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sent integer;
begin
  perform pg_advisory_xact_lock(hashtext('user_reports:' || new.reporter_id::text));
  delete from user_report_sends where reporter_id = new.reporter_id and created_at < now() - interval '24 hours';
  select count(*) into sent from user_report_sends where reporter_id = new.reporter_id;
  if sent >= 20 then
    raise exception 'You''ve sent a lot of reports today. We''ll look at the ones you sent.' using errcode = 'P0001';
  end if;
  insert into user_report_sends (reporter_id) values (new.reporter_id);

  select p.username, p.bio into new.reported_username, new.reported_bio
  from public.profiles p where p.id = new.reported_id;
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.prepare_user_report() from public, anon, authenticated;

drop trigger if exists user_reports_prepare on public.user_reports;
create trigger user_reports_prepare
  before insert on public.user_reports
  for each row execute function public.prepare_user_report();
