import { describe, expect, it } from 'vitest';
import { HEALTH_EVENT_TYPES, type HealthEvent } from './health';
import {
  CARE_LOG_LABEL,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
  PARTNER_FALLBACK_NAME,
  activeMembers,
  careLogLabel,
  formatInviteCode,
  generateInviteCode,
  inviteErrorMessage,
  isOwnPet,
  canJoinAnotherPet,
  inviteExpiresAt,
  isInviteOpen,
  isSharedPet,
  memberDisplayName,
  memberRole,
  mergeCareDiary,
  normalizeInviteCode,
  partnerActivityMessage,
  partnerEntriesSince,
  type CareLogEntry,
  type PetInvite,
  type PetMember,
} from './carePartners';

const ME = 'user-me';
const ALEX = 'user-alex';
const SAM = 'user-sam';

const member = (overrides: Partial<PetMember> & Pick<PetMember, 'userId'>): PetMember => ({
  role: 'partner',
  joinedAt: '2026-09-01T00:00:00.000Z',
  displayName: null,
  ...overrides,
});

const members: PetMember[] = [
  member({ userId: ME, role: 'owner', displayName: 'Me' }),
  member({ userId: ALEX, displayName: 'Alex' }),
];

const logEntry = (overrides: Partial<CareLogEntry> & Pick<CareLogEntry, 'id' | 'userId'>): CareLogEntry => ({
  petId: 'pet-1',
  type: 'WORKOUT',
  occurredAt: '2026-09-07T10:00:00.000Z',
  ...overrides,
});

const ownEvent = (overrides: Partial<HealthEvent> & Pick<HealthEvent, 'id'>): HealthEvent => ({
  userId: ME,
  occurredAt: '2026-09-07T09:00:00.000Z',
  type: 'MEAL',
  source: 'manual',
  metadata: {},
  ...overrides,
});

const invite = (overrides: Partial<PetInvite> = {}): PetInvite => ({
  id: 'inv-1',
  petId: 'pet-1',
  code: 'ABCDEF',
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-09-08T00:00:00.000Z',
  ...overrides,
});

describe('invite codes', () => {
  it('generates a deterministic code from a fixed RNG', () => {
    const sequence = [0, 0.5, 0.999, 0.03125, 0.25, 0.75];
    let cursor = 0;
    const random = () => sequence[cursor++ % sequence.length];
    const code = generateInviteCode(random);
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(code).toBe('AS9BJ2');
    for (const char of code) expect(INVITE_CODE_ALPHABET).toContain(char);
    // Same sequence, same code.
    cursor = 0;
    expect(generateInviteCode(random)).toBe('AS9BJ2');
  });

  it('never indexes past the alphabet when the RNG returns 1', () => {
    expect(generateInviteCode(() => 1)).toBe('9'.repeat(INVITE_CODE_LENGTH));
  });

  it('only ever uses the confusable-free alphabet by default', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('normalises what a person typed', () => {
    expect(normalizeInviteCode('abc-d ef')).toBe('ABCDEF');
    expect(normalizeInviteCode(' abc—def ')).toBe('ABCDEF');
  });

  it('formats a code for display', () => {
    expect(formatInviteCode('ABCDEF')).toBe('ABC-DEF');
    expect(formatInviteCode('abc-def')).toBe('ABC-DEF');
    expect(formatInviteCode('ABC')).toBe('ABC');
  });

  it('expires a week after creation', () => {
    const created = new Date('2026-09-01T00:00:00.000Z');
    expect(inviteExpiresAt(created)).toBe(new Date(created.getTime() + INVITE_TTL_MS).toISOString());
    expect(inviteExpiresAt(created)).toBe('2026-09-08T00:00:00.000Z');
  });

  it('is open strictly before expiry and closed at or after it', () => {
    const expiry = Date.parse('2026-09-08T00:00:00.000Z');
    expect(isInviteOpen(invite(), new Date(expiry - 1))).toBe(true);
    expect(isInviteOpen(invite(), new Date(expiry))).toBe(false);
    expect(isInviteOpen(invite(), new Date(expiry + 1))).toBe(false);
  });

  it('is closed once redeemed or revoked', () => {
    const early = new Date('2026-09-02T00:00:00.000Z');
    expect(isInviteOpen(invite({ redeemedAt: '2026-09-02T00:00:00.000Z' }), early)).toBe(false);
    expect(isInviteOpen(invite({ revokedAt: '2026-09-02T00:00:00.000Z' }), early)).toBe(false);
  });
});

describe('members', () => {
  it('treats only members without leftAt as active', () => {
    const all = [...members, member({ userId: SAM, leftAt: '2026-09-05T00:00:00.000Z' })];
    expect(activeMembers(all).map((m) => m.userId)).toEqual([ME, ALEX]);
    expect(isSharedPet(all)).toBe(true);
    expect(isSharedPet([members[0]])).toBe(false);
    expect(isSharedPet([members[0], member({ userId: ALEX, leftAt: '2026-09-05T00:00:00.000Z' })])).toBe(false);
  });

  it('reports the active role, or null for strangers and leavers', () => {
    expect(memberRole(members, ME)).toBe('owner');
    expect(memberRole(members, ALEX)).toBe('partner');
    expect(memberRole(members, SAM)).toBeNull();
    expect(memberRole([member({ userId: SAM, leftAt: '2026-09-05T00:00:00.000Z' })], SAM)).toBeNull();
  });

  it('falls back to a neutral name', () => {
    expect(memberDisplayName(members, ALEX)).toBe('Alex');
    expect(memberDisplayName([member({ userId: ALEX })], ALEX)).toBe(PARTNER_FALLBACK_NAME);
    expect(memberDisplayName(members, 'nobody')).toBe(PARTNER_FALLBACK_NAME);
  });
});

describe('care log labels', () => {
  it('has a label for every health event type', () => {
    for (const type of HEALTH_EVENT_TYPES) {
      expect(typeof CARE_LOG_LABEL[type]).toBe('string');
      expect(CARE_LOG_LABEL[type].length).toBeGreaterThan(0);
      expect(careLogLabel(type)).toBe(CARE_LOG_LABEL[type]);
    }
    expect(Object.keys(CARE_LOG_LABEL).sort()).toEqual([...HEALTH_EVENT_TYPES].sort());
  });
});

describe('mergeCareDiary', () => {
  it('attributes partner rows by name, drops own rows, and leaves own events unnamed', () => {
    const diary = mergeCareDiary({
      ownEvents: [ownEvent({ id: 'own-1' })],
      careLog: [
        logEntry({ id: 'log-alex', userId: ALEX }),
        logEntry({ id: 'log-me', userId: ME, type: 'MEAL', occurredAt: '2026-09-07T09:00:00.000Z' }),
      ],
      members,
      selfUserId: ME,
    });
    expect(diary.map((e) => e.id)).toEqual(['log-alex', 'own-1']);
    expect(diary[0]).toMatchObject({ actorUserId: ALEX, actorName: 'Alex', label: 'Trained together', type: 'WORKOUT' });
    expect(diary[1]).toMatchObject({ actorUserId: ME, actorName: null, label: 'Shared a meal', type: 'MEAL' });
  });

  it('resolves a member who has left, and falls back for an unknown user', () => {
    const diary = mergeCareDiary({
      ownEvents: [],
      careLog: [
        logEntry({ id: 'log-sam', userId: SAM, occurredAt: '2026-09-04T10:00:00.000Z' }),
        logEntry({ id: 'log-ghost', userId: 'user-ghost', occurredAt: '2026-09-03T10:00:00.000Z' }),
      ],
      members: [...members, member({ userId: SAM, displayName: 'Sam', leftAt: '2026-09-05T00:00:00.000Z' })],
      selfUserId: ME,
    });
    expect(diary.map((e) => e.actorName)).toEqual(['Sam', PARTNER_FALLBACK_NAME]);
  });

  it('orders newest first, then by id, regardless of input order', () => {
    const input = {
      ownEvents: [
        ownEvent({ id: 'b', occurredAt: '2026-09-07T10:00:00.000Z' }),
        ownEvent({ id: 'z', occurredAt: '2026-09-06T10:00:00.000Z' }),
      ],
      careLog: [
        logEntry({ id: 'a', userId: ALEX, occurredAt: '2026-09-07T10:00:00.000Z' }),
        logEntry({ id: 'c', userId: ALEX, occurredAt: '2026-09-08T10:00:00.000Z' }),
      ],
      members,
      selfUserId: ME,
    };
    const expected = ['c', 'a', 'b', 'z'];
    expect(mergeCareDiary(input).map((e) => e.id)).toEqual(expected);
    const reversed = {
      ...input,
      ownEvents: [...input.ownEvents].reverse(),
      careLog: [...input.careLog].reverse(),
    };
    expect(mergeCareDiary(reversed).map((e) => e.id)).toEqual(expected);
  });
});

describe('partnerEntriesSince', () => {
  const log = [
    logEntry({ id: 'before', userId: ALEX, occurredAt: '2026-09-07T09:59:59.999Z' }),
    logEntry({ id: 'at', userId: ALEX, occurredAt: '2026-09-07T10:00:00.000Z' }),
    logEntry({ id: 'after', userId: ALEX, occurredAt: '2026-09-07T10:00:00.001Z' }),
    logEntry({ id: 'mine', userId: ME, occurredAt: '2026-09-07T11:00:00.000Z' }),
  ];

  it('returns partner rows strictly after the cursor', () => {
    expect(partnerEntriesSince(log, '2026-09-07T10:00:00.000Z', ME).map((e) => e.id)).toEqual(['after']);
  });

  it('returns every partner row when nothing has been seen yet', () => {
    expect(partnerEntriesSince(log, null, ME).map((e) => e.id)).toEqual(['before', 'at', 'after']);
  });
});

describe('partnerActivityMessage', () => {
  it('is null when nothing happened', () => {
    expect(partnerActivityMessage([], members, 'Miso')).toBeNull();
  });

  it('names the moment for a single entry', () => {
    expect(partnerActivityMessage([logEntry({ id: '1', userId: ALEX })], members, 'Miso')).toBe(
      'Alex trained together with Miso while you were away.',
    );
    expect(partnerActivityMessage([logEntry({ id: '1', userId: ALEX, type: 'MEAL' })], members, 'Miso')).toBe(
      'Alex shared a meal with Miso while you were away.',
    );
  });

  it('counts several entries and lists each carer once', () => {
    const three = [
      logEntry({ id: '1', userId: ALEX }),
      logEntry({ id: '2', userId: ALEX, type: 'MEAL' }),
      logEntry({ id: '3', userId: ALEX, type: 'SLEEP' }),
    ];
    expect(partnerActivityMessage(three, members, 'Miso')).toBe('Alex cared for Miso 3 times while you were away.');

    const withSam = [...members, member({ userId: SAM, displayName: 'Sam' })];
    const two = [logEntry({ id: '1', userId: ALEX }), logEntry({ id: '2', userId: SAM })];
    expect(partnerActivityMessage(two, withSam, 'Miso')).toBe('Alex and Sam cared for Miso 2 times while you were away.');
  });

  it('falls back to the neutral name for an unnamed partner', () => {
    expect(partnerActivityMessage([logEntry({ id: '1', userId: 'user-ghost' })], members, 'Miso')).toBe(
      `${PARTNER_FALLBACK_NAME} trained together with Miso while you were away.`,
    );
  });
});

describe('inviteErrorMessage', () => {
  const codes = [
    'INVITE_NOT_FOUND',
    'INVITE_USED',
    'INVITE_EXPIRED',
    'OWN_INVITE',
    'ALREADY_MEMBER',
    'PET_FULL',
    'HAS_ACTIVE_PET',
    'HAS_JOINT_PET',
    'ALREADY_OWNS_PET',
    'NOT_A_MEMBER',
    'NOT_SIGNED_IN',
  ];

  it.each(codes)('maps %s to user-facing copy', (code) => {
    const fromRpc = inviteErrorMessage({ message: code, code: 'P0001', details: null, hint: null });
    expect(fromRpc).not.toContain(code);
    expect(fromRpc).not.toContain('P0001');
    expect(fromRpc.length).toBeGreaterThan(10);
    expect(inviteErrorMessage(new Error(code))).toBe(fromRpc);
  });

  it('gives each code distinct copy', () => {
    const copy = codes.map((code) => inviteErrorMessage(new Error(code)));
    expect(new Set(copy).size).toBe(codes.length);
  });

  it('falls back to the generic error message', () => {
    expect(inviteErrorMessage(new Error('boom'))).toBe('boom');
    expect(inviteErrorMessage({ message: 'network down', code: 'PGRST000' })).toBe('network down (PGRST000)');
    expect(inviteErrorMessage(undefined)).toBe('Could not join that pet.');
  });
});


describe('pet slots', () => {
  const mine = { userId: 'user-1' };
  const theirs = { userId: 'user-2' };

  it('tells the adopted pet from the joint one by who adopted it', () => {
    expect(isOwnPet(mine, 'user-1')).toBe(true);
    expect(isOwnPet(theirs, 'user-1')).toBe(false);
  });

  it('allows joining only while the joint slot is free', () => {
    expect(canJoinAnotherPet([], 'user-1')).toBe(true);
    expect(canJoinAnotherPet([mine], 'user-1')).toBe(true);
    // The joint slot is taken; the way to free it is to leave that pet.
    expect(canJoinAnotherPet([mine, theirs], 'user-1')).toBe(false);
    // Joined from onboarding, never adopted: still one joint slot, still full.
    expect(canJoinAnotherPet([theirs], 'user-1')).toBe(false);
  });
});
