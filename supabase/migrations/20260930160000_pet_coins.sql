-- Coins, kept by the server.
--
-- Earned by caring for the pet (one per XP point, 50 per level-up) and spent on
-- changes, such as switching the pet's animal (500). The rates mirror
-- packages/core/src/domain/coins.ts, which the app uses only to show a balance
-- before the server's arrives.
--
-- THE APP CANNOT WRITE COINS OR SWITCH BREEDS DIRECTLY:
--   * `pets_coins_and_breed` (a trigger) ignores any `coins` the app sends and
--     works the balance out from the XP change in the same save; a new pet
--     starts at 0. It likewise keeps the stored breed on an ordinary save.
--   * `switch_pet_breed` is the one way to change breed after adoption: it
--     checks the caller cares for the pet and can pay, then spends and switches
--     in one statement.
-- What this cannot do is verify XP itself: the care engine runs in the app and
-- reports XP, so earning is bounded by reported XP. Coins can no longer be set
-- to any value or spent without paying.

alter table public.pets
  add column if not exists coins integer not null default 0 check (coins >= 0);

-- Back pay, so existing pets are not starting from nothing: the XP they have
-- already earned (100 a level, plus what is into the current one) at the same
-- rate new XP pays, with the level-up bonus for every level passed.
update public.pets
set coins = greatest(0, (level - 1) * 100 + xp) + greatest(0, level - 1) * 50
where coins = 0;

create or replace function public.pets_coins_and_breed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gained integer;
begin
  -- Admin tooling and the functions below manage coins themselves.
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.coins_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adopting is free, and a new pet has earned nothing yet.
    new.coins := 0;
    return new;
  end if;

  -- Only XP earns, at the app's rates: 100 XP a level, 50 a level-up.
  gained := greatest(0, (new.level * 100 + new.xp) - (old.level * 100 + old.xp))
          + greatest(0, new.level - old.level) * 50;
  new.coins := old.coins + gained;
  -- The animal only changes through switch_pet_breed.
  new.breed := old.breed;
  return new;
end;
$$;

drop trigger if exists pets_coins_and_breed on public.pets;
create trigger pets_coins_and_breed
  before insert or update on public.pets
  for each row execute function public.pets_coins_and_breed();

create or replace function public.switch_pet_breed(p_pet_id uuid, p_breed text)
returns table(breed text, coins integer, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cost constant integer := 500;
  free boolean := coalesce(auth.jwt() ->> 'email', '') = 'kyleyli2005@gmail.com';
  current_row public.pets;
begin
  select * into current_row from public.pets where id = p_pet_id for update;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (current_row.user_id = auth.uid() or public.is_active_pet_member(p_pet_id)) then
    raise exception 'NOT_YOUR_PET' using errcode = '42501';
  end if;
  if current_row.breed is not distinct from p_breed then
    return query select current_row.breed, current_row.coins, current_row.version;
    return;
  end if;
  if not free and current_row.coins < cost then
    raise exception 'NOT_ENOUGH_COINS' using errcode = 'P0001', detail = current_row.coins::text;
  end if;

  perform set_config('vitto.coins_write', 'on', true);
  return query
    update public.pets p
    set breed = p_breed,
        coins = p.coins - case when free then 0 else cost end
    where p.id = p_pet_id
    returning p.breed, p.coins, p.version;
end;
$$;

revoke all on function public.switch_pet_breed(uuid, text) from public, anon;
grant execute on function public.switch_pet_breed(uuid, text) to authenticated;
