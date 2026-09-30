-- Coins come from level-ups only: 50 a level, nothing per XP point.
-- (packages/core/src/domain/coins.ts mirrors this for the balance the app shows.)

create or replace function public.pets_coins_and_breed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin tooling and switch_pet_breed manage coins themselves.
  if coalesce(auth.role(), '') = 'service_role'
     or current_setting('vitto.coins_write', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Adopting is free, and a new pet has earned nothing yet.
    new.coins := 0;
    return new;
  end if;

  new.coins := old.coins + greatest(0, new.level - old.level) * 50;
  -- The animal only changes through switch_pet_breed.
  new.breed := old.breed;
  return new;
end;
$$;

-- Restate balances under the new rule: 50 for every level reached. The coin
-- system went live minutes before this, and the only account that could have
-- spent any switches free, so nothing bought is lost.
-- The trigger above would otherwise keep the old balances; this flag is the
-- same bypass switch_pet_breed uses, local to this migration's transaction.
select set_config('vitto.coins_write', 'on', true);
update public.pets
set coins = greatest(0, level - 1) * 50;
