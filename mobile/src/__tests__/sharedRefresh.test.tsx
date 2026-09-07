import { type CareLogEntry, type PetMember, createPet } from '@vitto/core';
import { applySharedRefresh, newestOccurredAt } from '../services/sharedRefresh';

const pet = { ...createPet('user-1', 'Miso'), id: 'pet-1', version: 4 };
const owner: PetMember = { userId: 'user-1', role: 'owner', joinedAt: '2026-09-01T00:00:00Z', displayName: 'Kyle' };
const alex: PetMember = { userId: 'user-2', role: 'partner', joinedAt: '2026-09-02T00:00:00Z', displayName: 'Alex' };

const entry = (id: string, userId: string, occurredAt: string): CareLogEntry => ({
  id,
  petId: 'pet-1',
  userId,
  type: 'WORKOUT',
  occurredAt,
});

const ok = <T,>(value: T): PromiseSettledResult<T> => ({ status: 'fulfilled', value });
const failed = <T,>(): PromiseSettledResult<T> => ({ status: 'rejected', reason: new Error('offline') });

const base = {
  currentMembers: [owner, alex],
  lastSeenCareLogAt: '2026-09-07T10:00:00Z',
  selfUserId: 'user-1',
  petName: 'Miso',
};

describe('applySharedRefresh', () => {
  it('treats a fulfilled null pet as "gone", not as a failed reload', () => {
    const outcome = applySharedRefresh({
      ...base,
      petResult: ok(null),
      membersResult: ok([owner, alex]),
      careLogResult: ok([]),
      inviteResult: ok(null),
    });
    expect(outcome).toEqual({ kind: 'gone' });
  });

  it('keeps the current pet when the reload itself failed', () => {
    const outcome = applySharedRefresh({
      ...base,
      petResult: failed(),
      membersResult: failed(),
      careLogResult: failed(),
      inviteResult: failed(),
    });
    expect(outcome).toEqual({ kind: 'updated', lastSeenCareLogAt: base.lastSeenCareLogAt, announcement: null });
  });

  it('announces only the partner rows strictly after the last look and moves the mark', () => {
    const log = [
      entry('new-2', 'user-2', '2026-09-07T12:00:00Z'),
      entry('new-1', 'user-2', '2026-09-07T11:00:00Z'),
      entry('mine', 'user-1', '2026-09-07T11:30:00Z'),
      entry('seen', 'user-2', '2026-09-07T10:00:00Z'),
    ];
    const outcome = applySharedRefresh({
      ...base,
      petResult: ok(pet),
      membersResult: ok([owner, alex]),
      careLogResult: ok(log),
      inviteResult: ok(null),
    });
    expect(outcome.kind).toBe('updated');
    if (outcome.kind !== 'updated') return;
    expect(outcome.pet).toBe(pet);
    expect(outcome.careLog).toBe(log);
    expect(outcome.lastSeenCareLogAt).toBe('2026-09-07T12:00:00Z');
    expect(outcome.announcement).toBe('Alex cared for Miso 2 times while you were away.');
  });

  it('says nothing and keeps the mark when nothing new arrived', () => {
    const outcome = applySharedRefresh({
      ...base,
      petResult: ok(pet),
      membersResult: ok([owner, alex]),
      careLogResult: ok([entry('seen', 'user-2', '2026-09-07T10:00:00Z')]),
      inviteResult: ok(null),
    });
    expect(outcome).toMatchObject({ kind: 'updated', lastSeenCareLogAt: base.lastSeenCareLogAt, announcement: null });
  });

  it('names the partner from the fresh member list, falling back to the current one', () => {
    const outcome = applySharedRefresh({
      ...base,
      currentMembers: [owner, { ...alex, displayName: 'Old name' }],
      petResult: ok(pet),
      membersResult: failed(),
      careLogResult: ok([entry('new', 'user-2', '2026-09-07T12:00:00Z')]),
      inviteResult: ok(null),
    });
    expect(outcome.kind === 'updated' && outcome.announcement).toBe(
      'Old name trained together with Miso while you were away.',
    );
  });
});

describe('newestOccurredAt', () => {
  it('compares as times rather than text, and is null for nothing', () => {
    expect(newestOccurredAt([])).toBeNull();
    expect(
      newestOccurredAt([{ occurredAt: '2026-09-07T12:00:00.000Z' }, { occurredAt: '2026-09-07T13:00:00+02:00' }]),
    ).toBe('2026-09-07T12:00:00.000Z');
  });
});
