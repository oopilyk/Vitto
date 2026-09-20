// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/memory.ts
// Regenerate with: node scripts/syncCompanion.mjs

import type { CompanionMemory, ExtractedMemory } from './types.ts';
import { DAY, clamp01, overlap, tokenize } from './util.ts';

const MINOR_IMPORTANCE = 0.4;
const MINOR_TTL_MS = 14 * DAY;
/** How similar two memories must be to count as the same fact (0..1 token overlap). */
const DEDUPE_THRESHOLD = 0.6;
/** Below this a memory is not worth a line in the prompt. */
const MIN_RELEVANCE_SCORE = 0.15;

export interface RankedMemory {
  memory: CompanionMemory;
  score: number;
}

/** Whole days from `today` (local) to an ISO date; negative when in the past. */
const daysUntil = (isoDate: string, today: Date): number | null => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - base.getTime()) / DAY);
};

/**
 * Score = importance (decayed for minor facts) + recency + reference frequency +
 * relevance to the current message. Deliberately simple weights; tune once there
 * is real usage data.
 */
export const rankMemories = (list: readonly CompanionMemory[], query: string | undefined, now: number): RankedMemory[] => {
  const queryTokens = query ? tokenize(query) : new Set<string>();
  const today = new Date(now);
  return list
    .filter((memory) => memory.active && (memory.expiresAt === null || memory.expiresAt >= now))
    .map((memory) => {
      const ageDays = (now - memory.createdAt) / DAY;
      const sinceRefDays = (now - memory.lastReferencedAt) / DAY;
      const importance =
        memory.importance < MINOR_IMPORTANCE ? memory.importance * Math.exp(-ageDays / 7) : memory.importance;
      const recency = Math.exp(-sinceRefDays / 30);
      const frequency = Math.min(1, Math.log1p(memory.referenceCount) / Math.log1p(10));
      let relevance = overlap(queryTokens, tokenize(memory.content));
      // An upcoming or just-passed important event is relevant whatever was said.
      if (memory.category === 'importantEvent' && memory.eventDate) {
        const days = daysUntil(memory.eventDate, today);
        if (days !== null && days >= -1 && days <= 3) relevance = Math.max(relevance, 0.9 - Math.abs(days) * 0.15);
      }
      const score = 0.45 * importance * memory.confidence + 0.15 * recency + 0.1 * frequency + 0.3 * relevance;
      return { memory, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);
};

export const selectRelevantMemories = (
  list: readonly CompanionMemory[],
  query: string | undefined,
  now: number,
  limit = 8,
): RankedMemory[] => rankMemories(list, query, now).filter((ranked) => ranked.score >= MIN_RELEVANCE_SCORE).slice(0, limit);

/** Important events dated today or yesterday that the pet has not asked about yet. */
export const dueImportantEvents = (list: readonly CompanionMemory[], now: number): CompanionMemory[] => {
  const today = new Date(now);
  return list.filter((memory) => {
    if (!memory.active || memory.category !== 'importantEvent' || !memory.eventDate || memory.followedUpAt) return false;
    const days = daysUntil(memory.eventDate, today);
    return days !== null && days <= 0 && days >= -1;
  });
};

const expiryFor = (importance: number, now: number): number | null =>
  importance < MINOR_IMPORTANCE ? now + MINOR_TTL_MS : null;

export type MemoryWrite =
  | { kind: 'insert'; memory: Omit<CompanionMemory, 'id'> }
  | { kind: 'update'; id: string; patch: Partial<CompanionMemory> };

/**
 * Plans how freshly extracted facts land in the store, without touching it.
 * Near-duplicates in the same category MERGE, so a fact mentioned again is
 * strengthened instead of cloned. Returns the writes for the caller to apply,
 * and the importance of anything genuinely new (which is what builds trust).
 */
export const planMemoryWrites = (
  existing: readonly CompanionMemory[],
  extracted: readonly ExtractedMemory[],
  now: number,
  source: CompanionMemory['source'] = 'extraction',
): { writes: MemoryWrite[]; createdImportance: number[] } => {
  const known = existing.filter((memory) => memory.active).map((memory) => ({ ...memory }));
  const writes: MemoryWrite[] = [];
  const createdImportance: number[] = [];

  for (const candidate of extracted) {
    const content = candidate.content.trim().slice(0, 280);
    if (!content) continue;
    const tokens = tokenize(content);
    const importance = clamp01(candidate.importance);
    const duplicate = known.find(
      (memory) => memory.category === candidate.category && overlap(tokens, tokenize(memory.content)) >= DEDUPE_THRESHOLD,
    );
    if (duplicate) {
      const merged = Math.max(duplicate.importance, importance);
      const eventDate = candidate.eventDate ?? duplicate.eventDate;
      writes.push({
        kind: 'update',
        id: duplicate.id,
        patch: {
          content,
          importance: merged,
          confidence: clamp01(Math.max(duplicate.confidence, candidate.confidence)),
          referenceCount: duplicate.referenceCount + 1,
          lastReferencedAt: now,
          expiresAt: expiryFor(merged, now),
          eventDate,
          // A moved date is a new thing to ask about.
          followedUpAt: candidate.eventDate && candidate.eventDate !== duplicate.eventDate ? null : duplicate.followedUpAt,
        },
      });
      Object.assign(duplicate, { content, importance: merged });
      continue;
    }
    const memory: Omit<CompanionMemory, 'id'> = {
      category: candidate.category,
      content,
      importance,
      confidence: clamp01(candidate.confidence),
      createdAt: now,
      lastReferencedAt: now,
      referenceCount: 0,
      expiresAt: expiryFor(importance, now),
      eventDate: candidate.eventDate ?? null,
      followedUpAt: null,
      source,
      active: true,
    };
    writes.push({ kind: 'insert', memory });
    createdImportance.push(importance);
    // So a second candidate in the same batch dedupes against this one.
    known.push({ ...memory, id: `pending-${writes.length}` });
  }
  return { writes, createdImportance };
};
