-- The year someone was born, so their age goes up on its own.
--
-- Profiles kept only `age`, the number worked out at sign-up, so a 17-year-old
-- stayed 17 for good: never an adult for the companion, and their calorie
-- targets aged with them only if they edited it by hand. The app now works the
-- age out from this year (taking the birthday as mid-year, no month needed),
-- fills it in from the stored age for profiles that predate it, and keeps it
-- in step when someone edits their age. `age` stays, and stays written, so
-- older app builds read the same column they always did.

alter table public.profiles
  add column if not exists birth_year smallint;

alter table public.profiles drop constraint if exists profiles_birth_year_range;
alter table public.profiles
  add constraint profiles_birth_year_range
  check (birth_year is null or birth_year between 1900 and 2100) not valid;
