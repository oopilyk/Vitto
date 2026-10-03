-- Meal photos are no longer stored.
--
-- The app used to upload each photo to the meal-images bucket and have
-- analyze-meal read it back from there, which kept every plate anyone ever
-- photographed. The photo now travels in the request to analyze-meal, goes to
-- the model, and is dropped; only the analysis is kept.
--
-- Not removed here: the photos already in the bucket. Storage objects are
-- deleted through the Storage API, not SQL (see the note at the end).

-- 1. An analysis no longer points at a photo.
alter table public.meal_analyses alter column storage_path drop not null;
-- The paths of photos that are being deleted point at nothing.
update public.meal_analyses set storage_path = null where storage_path is not null;

-- 2. Nobody can put a photo in the bucket, or read one back out. The delete
--    policy stays, so the leftover photos can still be cleared.
drop policy if exists "Users upload their meal images" on storage.objects;
drop policy if exists "Users read their meal images" on storage.objects;

-- 3. Belt and braces: a 1-byte limit refuses every photo, even if an upload
--    policy is added back by mistake.
update storage.buckets
set file_size_limit = 1
where id = 'meal-images';

-- Clearing the photos already stored (run once, after this migration):
--   Dashboard -> Storage -> meal-images -> select all -> Delete
-- or with the CLI:
--   supabase storage rm --recursive ss:///meal-images --experimental
