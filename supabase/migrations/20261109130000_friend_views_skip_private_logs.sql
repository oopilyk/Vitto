-- Friends see a type and a time for what someone last did. Two kinds of row
-- must not be that "last thing":
--   * a weigh-in (BODY_WEIGHT), which is private body data;
--   * a log its owner took back (metadata.removedAt, see removedEvents.ts).
--
-- Both functions are otherwise exactly as last defined (get_friend_recent_activity
-- in 20260908120000, get_friends_overview in 20260927130000); the signatures
-- are unchanged, so the client contract is too.

create or replace function public.get_friend_recent_activity(friend_id uuid)
returns table(type text, occurred_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select he.type, he.occurred_at
  from public.health_events he
  where he.user_id = friend_id
    and he.occurred_at >= now() - interval '3 days'
    and he.type <> 'BODY_WEIGHT'
    and not (he.metadata ? 'removedAt')
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    )
  order by he.occurred_at desc
  limit 20;
$$;

revoke all on function public.get_friend_recent_activity(uuid) from public, anon;
grant execute on function public.get_friend_recent_activity(uuid) to authenticated;

create or replace function public.get_friends_overview()
returns table(
  friend_id uuid,
  username text,
  display_name text,
  pet jsonb,
  last_activity_type text,
  last_activity_at timestamptz,
  friends_since timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    f.friend_id,
    prof.username,
    case
      when prof.display_name is null or btrim(prof.display_name) = '' or prof.display_name like '%@%' then null
      else prof.display_name
    end,
    (
      select public.friend_pet_json(p)
      from public.pets p
      where p.user_id = f.friend_id
        and exists (
          select 1 from public.pet_members m
          where m.pet_id = p.id and m.user_id = p.user_id and m.left_at is null
        )
      order by p.created_at desc
      limit 1
    ) as pet,
    act.type as last_activity_type,
    act.occurred_at as last_activity_at,
    f.friends_since
  from (
    select
      case
        when fr.requester_id = auth.uid() then fr.addressee_id
        else fr.requester_id
      end as friend_id,
      coalesce(fr.responded_at, fr.created_at) as friends_since
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.requester_id = auth.uid() or fr.addressee_id = auth.uid())
  ) f
  left join public.profiles prof on prof.id = f.friend_id
  left join lateral (
    select he.type, he.occurred_at
    from public.health_events he
    where he.user_id = f.friend_id
      and he.occurred_at >= now() - interval '3 days'
      and he.type <> 'BODY_WEIGHT'
      and not (he.metadata ? 'removedAt')
    order by he.occurred_at desc
    limit 1
  ) act on true
  where exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = f.friend_id)
        or (fr.addressee_id = auth.uid() and fr.requester_id = f.friend_id))
  )
  order by f.friends_since desc;
$$;

revoke all on function public.get_friends_overview() from public, anon;
grant execute on function public.get_friends_overview() to authenticated;
