-- The waitlist behind the landing page (web/src/landing).
--
-- Written straight from the browser with the anon key, so the policy below is
-- the whole of the security model and it is deliberately lopsided: anyone may
-- ADD an email, nobody may READ one. A public list of who signed up is exactly
-- the thing a waitlist must not leak, so there is no select policy at all and
-- the page never asks for the row back (`returning: minimal`).
--
-- Duplicates are a unique violation on the normalised address rather than a
-- lookup-then-insert: the page cannot look up, and treating "already here" as
-- success is the right answer for the person anyway.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null
    constraint waitlist_email_length check (char_length(email) between 3 and 254)
    constraint waitlist_email_shape check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Case and whitespace are not different people.
  email_normalized text generated always as (lower(btrim(email))) stored,
  -- Where the form lived: 'web', or a campaign tag the page was opened with.
  source text not null default 'web'
    constraint waitlist_source_length check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_key on public.waitlist (email_normalized);

alter table public.waitlist enable row level security;

drop policy if exists "Anyone may join the waitlist" on public.waitlist;
create policy "Anyone may join the waitlist" on public.waitlist
  for insert to anon, authenticated
  with check (true);
-- No select, update or delete policy: the list is read from the dashboard, or
-- with the service role, never by the page.
