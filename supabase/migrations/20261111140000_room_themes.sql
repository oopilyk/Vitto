-- Room themes: the art the pet's rooms are drawn in.
--
-- `room_theme` is what the pet's rooms wear now (null reads as 'classic', which
-- every pet has); `owned_room_themes` is every theme bought. A new theme costs
-- coins (500) through `switch_pet_room_theme`; going back to one already owned
-- is free. Like the breed and the animals owned, an ordinary save cannot change
-- either column, so no build can get a theme without paying.
--
-- Two columns, one trigger function replaced in place, one new function.
--
-- Also retires the cosmetics feature from 20261111130000_pet_cosmetics.sql,
-- which the app no longer has: the trigger below drops its cosmetics rules,
-- and buy_pet_cosmetic goes, so nothing can spend coins on items that are
-- never shown. Its two columns stay, unused, so no data is deleted.

alter table public.pets
  add column if not exists room_theme text,
  add column if not exists owned_room_themes text[];

drop function if exists public.buy_pet_cosmetic(uuid, text);

-- from 20261018120000_pet_collection.sql (not the cosmetics version from
-- 20261111130000), now also keeping the room theme out of an ordinary save's reach.
create or replace function public.pets_coins_and_breed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin tooling, switch_pet_breed and switch_pet_room_theme manage coins themselves.
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.coins_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adopting is free, a new pet has earned nothing yet, and the animal it
    -- was adopted as is the first one it owns. Its rooms start classic.
    new.coins := 0;
    new.owned_breeds := case when new.breed is null then null else array[new.breed] end;
    new.room_theme := null;
    new.owned_room_themes := null;
    return new;
  end if;

  new.coins := old.coins + greatest(0, new.level - old.level) * 50;
  -- The animal, the animals owned and the rooms only change through their
  -- switch functions.
  new.breed := old.breed;
  new.owned_breeds := old.owned_breeds;
  new.room_theme := old.room_theme;
  new.owned_room_themes := old.owned_room_themes;
  return new;
end;
$$;

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
  if p_theme is null or p_theme not in ('classic', 'space') then
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
