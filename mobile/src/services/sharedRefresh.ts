import {
  type CareLogEntry,
  type PetInvite,
  type PetMember,
  type PetState,
  partnerActivityMessage,
  partnerEntriesSince,
} from '@vitto/core';

/**
 * The pure half of App's `refreshShared`: given what the four reloads came
 * back with, decide what the app should now hold and whether to announce
 * anything. Kept out of App so the "pet is gone" and "what is new since I last
 * looked" rules can be tested without a renderer.
 */

/** The latest `occurredAt` in a list, or null for none; ISO strings are compared as times, not text. */
export const newestOccurredAt = (entries: { occurredAt: string }[]): string | null =>
  entries.reduce<string | null>(
    (newest, entry) => (newest === null || Date.parse(entry.occurredAt) > Date.parse(newest) ? entry.occurredAt : newest),
    null,
  );

export interface SharedRefreshInput {
  petResult: PromiseSettledResult<PetState | null>;
  membersResult: PromiseSettledResult<PetMember[]>;
  careLogResult: PromiseSettledResult<CareLogEntry[]>;
  inviteResult: PromiseSettledResult<PetInvite | null>;
  /** What the app holds now, used wherever a reload failed. */
  currentMembers: PetMember[];
  lastSeenCareLogAt: string | null;
  selfUserId: string;
  petName: string;
}

export type SharedRefreshOutcome =
  /** The row is no longer visible to this user: they left, or were moved, on another device. */
  | { kind: 'gone' }
  | {
      kind: 'updated';
      /** Each is present only when its reload succeeded; a failed one leaves state alone. */
      pet?: PetState;
      members?: PetMember[];
      invite?: PetInvite | null;
      careLog?: CareLogEntry[];
      /** The new high-water mark; unchanged when nothing new arrived or the log failed. */
      lastSeenCareLogAt: string | null;
      /** What to say about the partner's care since the last look, or null for nothing. */
      announcement: string | null;
    };

export const applySharedRefresh = ({
  petResult,
  membersResult,
  careLogResult,
  inviteResult,
  currentMembers,
  lastSeenCareLogAt,
  selfUserId,
  petName,
}: SharedRefreshInput): SharedRefreshOutcome => {
  // A fulfilled null is an answer, not a failure: RLS shows a member their pet,
  // so "no row" means this user is no longer a member. Keeping the stale pet
  // would let the next care moment fail its update with a raw RLS error.
  if (petResult.status === 'fulfilled' && petResult.value === null) return { kind: 'gone' };

  const outcome: SharedRefreshOutcome = { kind: 'updated', lastSeenCareLogAt, announcement: null };
  if (petResult.status === 'fulfilled' && petResult.value) outcome.pet = petResult.value;
  const members = membersResult.status === 'fulfilled' ? membersResult.value : currentMembers;
  if (membersResult.status === 'fulfilled') outcome.members = members;
  if (inviteResult.status === 'fulfilled') outcome.invite = inviteResult.value;
  if (careLogResult.status !== 'fulfilled') return outcome;

  outcome.careLog = careLogResult.value;
  const arrived = partnerEntriesSince(careLogResult.value, lastSeenCareLogAt, selfUserId);
  if (arrived.length === 0) return outcome;
  outcome.lastSeenCareLogAt = newestOccurredAt(arrived);
  outcome.announcement = partnerActivityMessage(arrived, members, petName);
  return outcome;
};
