-- Show who is asking to be friends.
--
-- `get_friend_profile` gated on `status = 'accepted'`, so a PENDING request
-- returned no row and the requests banner fell back to printing the requester's
-- raw UUID -- "9cb15a37-ebd7-42b6-... wants to be friends".
--
-- Widened to any live counterparty: accepted OR pending, in either direction.
-- That leaks nothing new. The only fields returned are username and display
-- name, both already discoverable through `search_profiles` by anyone who can
-- type a username -- which is exactly how the requester found this user in the
-- first place. Declined rows are deliberately still excluded: a declined
-- request is over, and its sender should not keep a readable name.
--
-- Same column list and same SECURITY DEFINER shape as before; only the
-- membership test changes.
create or replace function public.get_friend_profile(friend_id uuid)
returns table(id uuid, username text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.id = friend_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status in ('accepted', 'pending')
        and ((fr.requester_id = auth.uid() and fr.addressee_id = friend_id)
          or (fr.addressee_id = auth.uid() and fr.requester_id = friend_id))
    );
$$;

revoke all on function public.get_friend_profile(uuid) from public;
grant execute on function public.get_friend_profile(uuid) to authenticated;
