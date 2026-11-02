-- The phone's time zone by name ("America/New_York"), beside the offset.
--
-- The offset is only refreshed when the app is opened, so after every clock
-- change it was an hour out until then: quiet hours ended an hour early or
-- late and evening nudges came at the wrong time. With the zone, the notify
-- job works out the offset as of the moment it sends. Null for builds that
-- predate it; those keep using the offset.

alter table public.push_devices
  add column if not exists time_zone text;

alter table public.push_devices drop constraint if exists push_devices_time_zone_length;
alter table public.push_devices
  add constraint push_devices_time_zone_length
  check (time_zone is null or char_length(time_zone) between 1 and 64) not valid;
