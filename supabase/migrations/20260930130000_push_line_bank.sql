-- Push notifications without a model call per push.
--
-- The pet writes a bank of push lines once, in its own voice, a few for every
-- kind of push (see packages/core/src/companion/pushLines.ts); the notify job
-- picks from it instead of generating each message. Stored with the companion
-- state it belongs to, plus what it was written under (`push_lines_key`: name,
-- temperament, persona, dials, tier) so a change of voice rewrites it.
--
-- Written only by the notify job with the service role. Readable by the owner
-- through the existing companion_state policies, which is harmless: it is their
-- pet's own lines.
alter table public.companion_state
  add column if not exists push_lines jsonb,
  add column if not exists push_lines_key text,
  add column if not exists push_lines_at timestamptz;
