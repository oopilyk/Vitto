-- Building muscle alongside the weight goal (lose fat while building it, or
-- build it at the same weight). Null means no, which every existing profile
-- keeps. Read by calculateMacroTargets in packages/core/src/domain/macroTargets.ts.
alter table public.profiles
  add column if not exists build_muscle boolean;
