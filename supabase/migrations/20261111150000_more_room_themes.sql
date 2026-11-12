-- Seven more room themes: cloud, elf, reef, mountain, candy, desert and cyber, each with
-- art for all five rooms (see ROOM_THEMES in packages/core roomThemes.ts).
--
-- Only the list of themes switch_pet_room_theme accepts changes; the function
-- is otherwise exactly as in 20261111140000_room_themes.sql. Safe to re-run.

-- Same caller rules and errors as switch_pet_breed.
create or replace function public.switch_pet_room_theme(p_pet_id uuid, p_theme text)
returns table(room_theme text, owned_room_themes text[], coins integer, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cost constant integer := 500;
  free boolean := public.is_dev_account();
  current_row public.pets;
  owned text[];
  already_owned boolean;
begin
  select * into current_row from public.pets where id = p_pet_id for update;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_active_pet_member(p_pet_id) then
    raise exception 'NOT_YOUR_PET' using errcode = '42501';
  end if;
  -- Only themes the app has art for; anything else would be bought for nothing.
  if p_theme is null or p_theme not in ('classic', 'space', 'cloud', 'elf', 'reef', 'mountain', 'candy', 'desert', 'cyber') then
    raise exception 'UNKNOWN_ROOM_THEME' using errcode = '22023';
  end if;

  owned := coalesce(current_row.owned_room_themes, '{}'::text[]);
  already_owned := p_theme = 'classic' or p_theme = any(owned);
  if not already_owned then
    owned := owned || p_theme;
  end if;

  if not free and not already_owned and current_row.coins < cost then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set room_theme = nullif(p_theme, 'classic'),
        owned_room_themes = owned,
        coins = p.coins - case when free or already_owned then 0 else cost end
    where p.id = p_pet_id
    returning p.room_theme, p.owned_room_themes, p.coins, p.version;
end;
$$;

revoke all on function public.switch_pet_room_theme(uuid, text) from public, anon;
grant execute on function public.switch_pet_room_theme(uuid, text) to authenticated;
