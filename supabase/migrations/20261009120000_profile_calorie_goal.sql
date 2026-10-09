-- The daily calories a person chose themselves, over the one Vitto works out
-- from their body and goal. Null means "work it out", which is the default and
-- what every existing profile keeps. Bounds match CALORIE_GOAL_RANGE in
-- packages/core/src/domain/macroTargets.ts.
alter table public.profiles
  add column if not exists calorie_goal integer
  check (calorie_goal is null or calorie_goal between 1000 and 6000);
