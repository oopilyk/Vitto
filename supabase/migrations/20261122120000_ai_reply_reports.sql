-- Reporting what the pet said. The pet's chat replies are written by an AI
-- model, and App Review expects a way to flag generated content that is
-- offensive or harmful (guideline 1.2 / 1.1), like reporting a person.
--
-- A report names one pet reply the reporter received. The server copies what
-- that reply said and the pet's custom character at that moment, because the
-- message is pruned after 90 days and the character can change. Only the
-- project owner reads reports (Supabase dashboard, `ai_reply_reports`); users
-- can file them but never read them.
--
-- Reports share the 20-a-day allowance of `user_reports` (user_report_sends).

create table if not exists public.ai_reply_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- No foreign key: the message may be pruned; the snapshot below stays.
  message_id uuid not null,
  reason text not null check (reason in ('offensive', 'sexual', 'harmful', 'wrong', 'other')),
  details text check (details is null or char_length(details) <= 500),
  -- Filled in by the trigger below.
  pet_id uuid,
  reply_content text,
  reply_created_at timestamptz,
  pet_persona text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, message_id)
);

create index if not exists ai_reply_reports_open on public.ai_reply_reports (status, created_at desc);

alter table public.ai_reply_reports enable row level security;

-- File only, as yourself. No select policy: reports are read in the dashboard.
drop policy if exists "Users report replies as themselves" on public.ai_reply_reports;
create policy "Users report replies as themselves" on public.ai_reply_reports
  for insert to authenticated with check (reporter_id = auth.uid());

grant insert on public.ai_reply_reports to authenticated;

-- Checks the reply is a pet message this person received, snapshots it, keeps
-- the status 'open' whatever the client sent, and holds the daily allowance.
create or replace function public.prepare_ai_reply_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sent integer;
  found boolean;
begin
  select true, m.pet_id, m.content, m.created_at
    into found, new.pet_id, new.reply_content, new.reply_created_at
  from public.companion_messages m
  where m.id = new.message_id and m.user_id = new.reporter_id and m.role = 'pet';
  if found is null then
    raise exception 'That reply could not be found.' using errcode = 'P0001';
  end if;

  -- The same lock and allowance as user reports.
  perform pg_advisory_xact_lock(hashtext('user_reports:' || new.reporter_id::text));
  delete from user_report_sends where reporter_id = new.reporter_id and created_at < now() - interval '24 hours';
  select count(*) into sent from user_report_sends where reporter_id = new.reporter_id;
  if sent >= 20 then
    raise exception 'You''ve sent a lot of reports today. We''ll look at the ones you sent.' using errcode = 'P0001';
  end if;
  insert into user_report_sends (reporter_id) values (new.reporter_id);

  select p.persona into new.pet_persona from public.pets p where p.id = new.pet_id;
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.prepare_ai_reply_report() from public, anon, authenticated;

drop trigger if exists ai_reply_reports_prepare on public.ai_reply_reports;
create trigger ai_reply_reports_prepare
  before insert on public.ai_reply_reports
  for each row execute function public.prepare_ai_reply_report();
