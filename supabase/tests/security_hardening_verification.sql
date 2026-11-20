-- Manual verification for
-- supabase/migrations/20261120120000_security_hardening.sql.
--
-- Like the other files here this is a scratch script, NOT a migration -- run it
-- by hand against a local or disposable Supabase instance. NEVER run it against
-- production: it inserts rows in auth.users. Everything happens in one
-- transaction that is rolled back at the end.
--
-- Each line it prints says what a closed hole looks like. Run before the
-- migration it reads: coins=550, true, t, 15, 130. Run after: coins=50, false,
-- refused, 10, 120, with the honest paths (1a, 1c, 2a, 2d, 2e, 3b) unchanged.
--
--   psql -f supabase/tests/security_hardening_verification.sql

\set QUIET on
\pset format unaligned
\pset tuples_only on
begin;
-- Setup, as the database owner with triggers off: three users, A and B friends, B has blocked C.
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'b@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'c@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'alice_test'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'bobby_test'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'carol_test')
  on conflict (id) do update set username = excluded.username;
insert into public.friend_requests (id, requester_id, addressee_id, status)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b', 'accepted');
insert into public.user_blocks (blocker_id, blocked_id)
  values ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000c');
set local session_replication_role = origin;

-- ===== 1. Coins, as user A through the same door the app uses =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.pets (id, user_id, name, species, mood)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Test', 'bunny', 'content');
-- An honest level-up: +50.
update public.pets set level = 2, xp = 0 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select '1a honest level-up        coins=' || coins || ' level=' || level || ' levels_today=' || levels_today from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- The hole: step down to (1, 100), climb back to (2, 0), ten times.
do $$ begin
  for i in 1..10 loop
    update public.pets set level = 1, xp = 100 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
    update public.pets set level = 2, xp = 0 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  end loop;
end $$;
select '1b after 10 down/up pairs  coins=' || coins || ' level=' || level || ' xp=' || xp || ' levels_today=' || levels_today || '   (closed = coins 50)' from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- Honest play still works: xp up within a level, then five more levels (the day's six), a seventh refused.
update public.pets set xp = 60 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.pets set level = 9, xp = 10 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select '1c xp then +7 levels asked coins=' || coins || ' level=' || level || ' levels_today=' || levels_today || '   (expect level 7, levels_today 6, coins 300)' from public.pets where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ===== 2. Friendship and block lookups =====
select '2a A asks about A+B: ' || public.are_friends('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b') || '   (expect true)';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000c","role":"authenticated"}';
select '2b C asks about A+B: ' || public.are_friends('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b') || '   (closed = false)';
do $$ declare answer boolean; begin
  answer := public.blocked_between('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-00000000000b');
  raise notice '2c C asks "has B blocked me": %   (closed = refused)', answer;
exception when insufficient_privilege then raise notice '2c C asks "has B blocked me": refused';
end $$;
-- Search still hides the person who blocked C, and still finds others.
select '2d C searches "bob": ' || count(*) || ' row(s)   (expect 0: B blocked C)' from public.search_profiles('bob');
select '2e C searches "ali": ' || count(*) || ' row(s)   (expect 1)' from public.search_profiles('ali');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ declare answer boolean; begin
  answer := public.are_friends('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b');
  raise notice '2f signed-out caller asks about A+B: %   (closed = refused)', answer;
exception when insufficient_privilege then raise notice '2f signed-out caller asks about A+B: refused';
end $$;

-- ===== 3. Reactions: 10 a day, backdated =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ declare sent integer := 0; begin
  for i in 1..15 loop
    begin
      insert into public.friend_reactions (from_user, to_user, kind, created_at)
        values ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b', 'nudge', '2000-01-01');
      sent := sent + 1;
    exception when others then null;
    end;
  end loop;
  raise notice '3a backdated reactions accepted out of 15: %   (closed = 10)', sent;
end $$;
-- A stranger still cannot react to someone who is not a friend.
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000c","role":"authenticated"}';
do $$ begin
  insert into public.friend_reactions (from_user, to_user, kind)
    values ('aaaaaaaa-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-00000000000a', 'cheer');
  raise notice '3b non-friend reaction: ACCEPTED (bad)';
exception when others then raise notice '3b non-friend reaction: refused   (expect refused)';
end $$;

-- ===== 4. Username search limit =====
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ declare made integer := 0; begin
  for i in 1..130 loop
    begin
      perform * from public.search_profiles('bob');
      made := made + 1;
    exception when others then null;
    end;
  end loop;
  raise notice '4a searches answered out of 130 in a row: %   (closed = 120)', made;
end $$;
rollback;
