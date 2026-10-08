import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  PUSH_LINES_MAX_AGE_MS,
  buildPetContext,
  parsePushLines,
  pushVoiceKey,
  renderPushLinesInstruction,
  type CompanionTier,
  type LifeContext,
  type PushLineBank,
} from './companion/index.ts';
import { chatModelFor, generatePushLines } from './model.ts';
import { claimAiCall } from './aiBudget.ts';

/** Bank rewrites one person's pet may have in 24 hours. */
const PUSH_LINE_REWRITES_PER_DAY = 3;

const iso = (ms: number) => new Date(ms).toISOString();

/** What `companion_state` already holds for this pet's bank. */
export interface StoredBank {
  pushLines: PushLineBank | null;
  pushLinesKey: string | null;
  pushLinesAt: number | null;
}

export const storedBankFrom = (row: { push_lines?: unknown; push_lines_key?: string | null; push_lines_at?: string | null } | null): StoredBank => ({
  pushLines: (row?.push_lines as PushLineBank | null) ?? null,
  pushLinesKey: row?.push_lines_key ?? null,
  pushLinesAt: row?.push_lines_at ? Date.parse(row.push_lines_at) : null,
});

/**
 * The pet's bank of pre-written lines (see pushLines.ts), current for its
 * voice: the stored one while it is fresh, else rewritten once (one model
 * call, then reused for a month) and stored. Shared by the notification job
 * and the in-app check-ins, so both speak from the same lines.
 */
export const bankFor = async (
  db: SupabaseClient,
  owner: { userId: string; petId: string; tier: CompanionTier; life: LifeContext },
  stored: StoredBank,
  build: () => ReturnType<typeof buildPetContext>,
  now: number,
): Promise<{ bank: PushLineBank | null; usage: unknown }> => {
  const key = pushVoiceKey(owner.life, owner.tier);
  const fresh = stored.pushLines && stored.pushLinesKey === key
    && stored.pushLinesAt !== null && now - stored.pushLinesAt < PUSH_LINES_MAX_AGE_MS;
  if (fresh) return { bank: stored.pushLines, usage: null };
  // A rewrite is rare (the voice changed, or the bank aged out), so a few a day
  // is plenty; past that, or past the app's ceiling, the old bank serves.
  if ((await claimAiCall(db, owner.userId, 'push_lines', PUSH_LINE_REWRITES_PER_DAY, owner.tier === 'plus' ? 'plus' : 'free')) !== 'ok') {
    return { bank: stored.pushLines, usage: null };
  }

  const written = await generatePushLines(build(), [], renderPushLinesInstruction(), chatModelFor(owner.tier, owner.life.pet.temperament));
  const bank = written ? parsePushLines(written.text) : null;
  if (!bank) {
    console.error(`[push-lines] could not write lines for ${owner.petId}; ${stored.pushLines ? 'keeping the old ones' : 'using stock lines'}`);
    return { bank: stored.pushLines, usage: written?.usage ?? null };
  }
  await db.from('companion_state').update({ push_lines: bank, push_lines_key: key, push_lines_at: iso(now) })
    .match({ user_id: owner.userId, pet_id: owner.petId });
  return { bank, usage: written?.usage ?? null };
};
