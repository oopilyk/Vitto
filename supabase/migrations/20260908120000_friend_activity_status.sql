-- Friend-visible "recent activity" signal, for the Friends/Social Pet feature's
-- pet-status card (see packages/core/src/domain/socialPetStatus.ts).
--
-- Privacy: `health_events` stays exactly as it is elsewhere in this codebase --
-- author-only, `for all using (auth.uid() = user_id)`, no table-level policy for
-- friends, no RLS change here. A friend is a *weaker* relationship than a care
-- partner, and even a care partner never reads another user's `health_events`
-- directly (see the "Privacy" note in 20260907120000_care_partners.sql) -- they
-- only ever see `pet_care_log`, which deliberately carries nothing but a type and
-- a timestamp. This RPC draws the identical line for friends: SECURITY DEFINER,
-- a fixed projection of exactly `type` + `occurred_at`, nothing else (never
-- `metadata`, which can carry meal photos, exact macros, workout notes,
-- screen-time totals), gated by the same accepted-friendship `exists (...)`
-- shape `get_friend_profile` already uses, and gone entirely after 3 days so a
-- friend's card can never become a long-run activity log of someone else.
--
-- No new table and no new index: this reuses the existing
-- health_events_user_occurred_idx (user_id, occurred_at desc) from
-- 20260828170000_initial_schema.sql, which already fits this query's
-- `where user_id = ... order by occurred_at desc` shape.

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
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    )
  order by he.occurred_at desc
  limit 20;
$$;

revoke all on function public.get_friend_recent_activity(uuid) from public;
grant execute on function public.get_friend_recent_activity(uuid) to authenticated;
