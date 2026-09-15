-- Identify a care partner by their username, the way friends already are.
--
-- `get_pet_members` returned only `display_name`, so a partner was named by a
-- free-text field while a friend was named by their handle. Two names for the
-- same person in one app is confusing, and the display name is the weaker of
-- the two: it is not unique, and it is seeded from the sign-up email (which is
-- exactly why the CASE below has always thrown away anything containing "@").
--
-- The handle is now returned alongside it and the client prefers it. The
-- display name stays for members who have not claimed one yet.
--
-- PRIVACY. A username is public-by-design: the whole point of "add a friend by
-- username" is that it is discoverable, and `search_profiles` already returns
-- it to any signed-in stranger. Returning it to someone who is already an
-- active member of the same pet exposes nothing new.

-- The return type gains a column, which `create or replace` cannot do, so the
-- function is dropped and re-created in the same transaction.
drop function if exists public.get_pet_members(uuid);

create function public.get_pet_members(p_pet_id uuid)
returns table (user_id uuid, role text, joined_at timestamptz, left_at timestamptz, display_name text, username text)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_active_pet_member(p_pet_id) then
    raise exception using message = 'NOT_A_MEMBER';
  end if;
  return query
    select
      m.user_id,
      m.role,
      m.joined_at,
      m.left_at,
      case
        when p.display_name is null or btrim(p.display_name) = '' or p.display_name like '%@%' then null
        else left(btrim(p.display_name), 40)
      end,
      p.username
    from public.pet_members m
    left join public.profiles p on p.id = m.user_id
    where m.pet_id = p_pet_id
    order by m.joined_at asc, m.user_id asc;
end;
$$;
revoke all on function public.get_pet_members(uuid) from public, anon;
grant execute on function public.get_pet_members(uuid) to authenticated;
