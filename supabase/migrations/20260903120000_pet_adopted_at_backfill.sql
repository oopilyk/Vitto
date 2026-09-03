-- `adopted_at` was added by 20260830100000_pet_adopted_at.sql as
-- `not null default now()`, so every pet that already existed was stamped with
-- the moment that migration ran rather than its real adoption date. On the
-- dashboard that restarted "Day N with <pet>" while the care streak, computed
-- from the events themselves, kept counting -- so a two-day-old pet could show a
-- four-day streak.
--
-- A pet cannot have been adopted after the row describing it was written, so
-- `created_at` is the correct floor. Only rows that disagree are touched, which
-- makes this safe to re-run and a no-op for every pet adopted since.
update public.pets
set adopted_at = created_at
where adopted_at > created_at;
