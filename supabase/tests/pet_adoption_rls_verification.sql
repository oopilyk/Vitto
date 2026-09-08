-- Manual RLS verification for the pet-adoption 403 fixed by
-- supabase/migrations/20260908130000_fix_pet_adopt_returning_rls.sql.
--
-- Like friends_rls_verification.sql, this is a scratch script, NOT a
-- migration -- run it by hand against a local/disposable Supabase instance.
-- Never run it against production data: it inserts and deletes rows in
-- auth.users.
--
-- Background: adopting a pet (INSERT into public.pets, exactly what
-- web/src/App.tsx's adopt() and packages/core's SupabaseRepository.savePet
-- do) failed for every user with 42501 "new row violates row-level security
-- policy for table pets", even though the INSERT policy's own WITH CHECK
-- (auth.uid() = user_id) was correct.
--
-- Root cause: PostgREST always executes inserts/upserts with an implicit
-- `RETURNING "pets".*` (regardless of whether the client chained
-- `.select()`), and Postgres additionally requires the table's SELECT policy
-- to pass for a RETURNING row. The SELECT policy ("Members read their pet")
-- requires is_active_pet_member(id), which is populated by the
-- on_pet_created AFTER INSERT trigger -- and regular AFTER ROW triggers fire
-- at the end of the statement, after Postgres has already checked whether
-- the row may be returned. So the membership row never existed yet at check
-- time, and the check always failed. This reproduces with a bare
-- `INSERT ... RETURNING id` -- no PostgREST, no JS client, no upsert
-- involved -- which is how it was isolated as a database-level bug, not a
-- web/ or mobile/ client bug (both call the same shared
-- packages/core SupabaseRepository.savePet).
--
-- ---------------------------------------------------------------------------
-- 0. Setup: one throwaway auth user, no pet yet.
-- ---------------------------------------------------------------------------

-- (Run as postgres/service_role.)
-- insert into auth.users (id, email) values
--   ('33333333-3333-3333-3333-333333333333', 'adopt-repro@example.com');

-- ---------------------------------------------------------------------------
-- 1. Impersonate that user and adopt: INSERT ... RETURNING must succeed.
--    Before the fix, this raised 42501 on every attempt.
-- ---------------------------------------------------------------------------

-- set local role authenticated;
-- set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
-- insert into public.pets (id, user_id, name, species, mood, adopted_at)
--   values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
--           '33333333-3333-3333-3333-333333333333',
--           'Miso', 'cat', 'content', now())
--   returning id;                                                            -- expect 1 row, no error

-- ---------------------------------------------------------------------------
-- 2. The same user can immediately read their own pet back (still works,
--    now via auth.uid() = user_id rather than waiting on pet_members).
-- ---------------------------------------------------------------------------

-- select * from public.pets where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'; -- expect 1 row

-- ---------------------------------------------------------------------------
-- 3. Cleanup (as postgres/service_role).
-- ---------------------------------------------------------------------------

-- delete from auth.users where id = '33333333-3333-3333-3333-333333333333';  -- cascades to pets/pet_members
