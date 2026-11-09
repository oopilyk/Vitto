-- Friend reactions: a small cheer sent to a friend ("High five!"), the way
-- Strava has kudos. A fixed set of kinds, nothing typed, so there is nothing
-- to moderate and nothing private to leak.
--
-- Who can do what, enforced here rather than trusted to the app:
--   * send: only as yourself, only to someone you are accepted friends with,
--     and at most 10 to the same friend in 24 hours (no spamming a friend);
--   * read: only reactions you sent or received;
--   * mark seen: only the receiver, and only the `seen_at` column.

create table if not exists public.friend_reactions (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cheer', 'high_five', 'proud', 'nudge')),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  check (from_user <> to_user)
);

create index if not exists friend_reactions_to_user_time on public.friend_reactions (to_user, created_at desc);
create index if not exists friend_reactions_pair_time on public.friend_reactions (from_user, to_user, created_at desc);

alter table public.friend_reactions enable row level security;

-- Accepted friends, either way round.
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = p_a and fr.addressee_id = p_b)
        or (fr.requester_id = p_b and fr.addressee_id = p_a))
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

drop policy if exists "Send reactions to friends" on public.friend_reactions;
create policy "Send reactions to friends" on public.friend_reactions
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and public.are_friends(from_user, to_user)
    and (
      select count(*) from public.friend_reactions r
      where r.from_user = auth.uid()
        and r.to_user = friend_reactions.to_user
        and r.created_at >= now() - interval '24 hours'
    ) < 10
  );

drop policy if exists "Read your own reactions" on public.friend_reactions;
create policy "Read your own reactions" on public.friend_reactions
  for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Receiver marks reactions seen" on public.friend_reactions;
create policy "Receiver marks reactions seen" on public.friend_reactions
  for update to authenticated
  using (to_user = auth.uid())
  with check (to_user = auth.uid());

-- Only `seen_at` can change; the rest of a reaction is what was sent.
revoke update on public.friend_reactions from authenticated;
grant update (seen_at) on public.friend_reactions to authenticated;
grant select, insert on public.friend_reactions to authenticated;
