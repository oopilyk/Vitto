-- NOTE: applied to the remote database, then the cosmetics feature was dropped
-- from the app. Kept so local history matches the server; its function is
-- dropped and its trigger logic replaced by 20261111140000_room_themes.sql.
-- The two columns it added are left in place, unused.
--
-- Cosmetics: things the pet wears (packages/core/src/domain/cosmetics.ts).
--
--   * `owned_cosmetics` is every item bought. Like coins and owned_breeds, only
--     buy_pet_cosmetic changes it: an ordinary save cannot add one without
--     paying, nor drop one by leaving the column out.
--   * `equipped_cosmetics` is what the pet has on, one item id per slot
--     ({"head": "crown", "neck": "scarf"}). The pet's own pick, so ordinary
--     saves set it; anything worn that is not owned is dropped on the way in.
--
-- Additive only: two columns, one function replaced in place, one new.

alter table public.pets
  add column if not exists owned_cosmetics text[],
  add column if not exists equipped_cosmetics jsonb not null default '{}'::jsonb
    constraint pets_equipped_cosmetics_is_object check (jsonb_typeof(equipped_cosmetics) = 'object');

-- from 20261018120000_pet_collection.sql, now also keeping owned cosmetics out
-- of an ordinary save's reach and what is worn to what is owned.
create or replace function public.pets_coins_and_breed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin tooling, switch_pet_breed and buy_pet_cosmetic manage coins themselves.
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.coins_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adopting is free, a new pet has earned nothing yet, and the animal it
    -- was adopted as is the first one it owns. It owns no cosmetics.
    new.coins := 0;
    new.owned_breeds := case when new.breed is null then null else array[new.breed] end;
    new.owned_cosmetics := null;
    new.equipped_cosmetics := '{}'::jsonb;
    return new;
  end if;

  new.coins := old.coins + greatest(0, new.level - old.level) * 50;
  -- The animal, and the animals owned, only change through switch_pet_breed.
  new.breed := old.breed;
  new.owned_breeds := old.owned_breeds;
  -- Cosmetics owned only change through buy_pet_cosmetic; what is worn may
  -- change, but only to things owned (a save without the column keeps it).
  new.owned_cosmetics := old.owned_cosmetics;
  new.equipped_cosmetics := coalesce((
    select jsonb_object_agg(slot, item)
    from jsonb_each_text(coalesce(new.equipped_cosmetics, old.equipped_cosmetics, '{}'::jsonb)) as worn(slot, item)
    where slot in ('head', 'face', 'neck', 'back')
      and item = any(coalesce(old.owned_cosmetics, '{}'::text[]))
  ), '{}'::jsonb);
  return new;
end;
$$;

-- Buys a cosmetic for the pet and puts it on. Prices must match COSMETICS in
-- packages/core/src/domain/cosmetics.ts; this list is the one that counts.
-- Same caller rules and errors as switch_pet_breed. Buying one already owned
-- costs nothing and just wears it.
create or replace function public.buy_pet_cosmetic(p_pet_id uuid, p_cosmetic text)
returns table(coins integer, owned_cosmetics text[], equipped_cosmetics jsonb, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  free boolean := public.is_dev_account();
  current_row public.pets;
  price integer;
  slot text;
  owned text[];
  already_owned boolean;
begin
  select item.price, item.slot into price, slot
  from (values
    ('beanie', 100, 'head'),
    ('crown', 300, 'head'),
    ('wizardHat', 300, 'head'),
    ('flowerCrown', 200, 'head'),
    ('headphones', 200, 'head'),
    ('roundGlasses', 150, 'face'),
    ('starSunglasses', 200, 'face'),
    ('scarf', 150, 'neck'),
    ('bowTie', 100, 'neck'),
    ('cape', 300, 'back')
  ) as item(id, price, slot)
  where item.id = p_cosmetic;
  if price is null then
    raise exception 'UNKNOWN_COSMETIC' using errcode = '22023';
  end if;

  select * into current_row from public.pets where id = p_pet_id for update;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Active carers only: a creator who has left no longer spends this pet's coins.
  if not public.is_active_pet_member(p_pet_id) then
    raise exception 'NOT_YOUR_PET' using errcode = '42501';
  end if;

  owned := coalesce(current_row.owned_cosmetics, '{}'::text[]);
  already_owned := p_cosmetic = any(owned);
  if not free and not already_owned and current_row.coins < price then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;
  if not already_owned then
    owned := owned || p_cosmetic;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set owned_cosmetics = owned,
        equipped_cosmetics = coalesce(p.equipped_cosmetics, '{}'::jsonb) || jsonb_build_object(slot, p_cosmetic),
        coins = p.coins - case when free or already_owned then 0 else price end
    where p.id = p_pet_id
    returning p.coins, p.owned_cosmetics, p.equipped_cosmetics, p.version;
end;
$$;

revoke all on function public.buy_pet_cosmetic(uuid, text) from public, anon;
grant execute on function public.buy_pet_cosmetic(uuid, text) to authenticated;
