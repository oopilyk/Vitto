import { describe, expect, it } from 'vitest';
import {
  otherPartyId,
  partitionFriendRequests,
  relationToUser,
  toFriend,
} from './friendRequests';
import type { FriendProfileSummary, FriendRequest } from './friends';

const ME = 'user-me';
const FRIEND_A = 'user-a';
const FRIEND_B = 'user-b';
const STRANGER = 'user-stranger';

const request = (overrides: Partial<FriendRequest>): FriendRequest => ({
  id: 'req-1',
  requesterId: ME,
  addresseeId: FRIEND_A,
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('partitionFriendRequests', () => {
  it('returns everything empty for an empty list', () => {
    expect(partitionFriendRequests([], ME)).toEqual({ accepted: [], incoming: [], outgoing: [] });
  });

  it('puts a pending request addressed to me in incoming', () => {
    const incoming = request({ id: 'r1', requesterId: FRIEND_A, addresseeId: ME, status: 'pending' });
    expect(partitionFriendRequests([incoming], ME)).toEqual({
      accepted: [],
      incoming: [incoming],
      outgoing: [],
    });
  });

  it('puts a pending request I sent in outgoing', () => {
    const outgoing = request({ id: 'r1', requesterId: ME, addresseeId: FRIEND_A, status: 'pending' });
    expect(partitionFriendRequests([outgoing], ME)).toEqual({
      accepted: [],
      incoming: [],
      outgoing: [outgoing],
    });
  });

  it('sorts a mix of accepted, pending, and declined requests, dropping declined', () => {
    const accepted = request({ id: 'r1', requesterId: ME, addresseeId: FRIEND_A, status: 'accepted' });
    const incoming = request({ id: 'r2', requesterId: FRIEND_B, addresseeId: ME, status: 'pending' });
    const outgoing = request({ id: 'r3', requesterId: ME, addresseeId: STRANGER, status: 'pending' });
    const declined = request({ id: 'r4', requesterId: ME, addresseeId: 'user-d', status: 'declined' });

    expect(partitionFriendRequests([accepted, incoming, outgoing, declined], ME)).toEqual({
      accepted: [accepted],
      incoming: [incoming],
      outgoing: [outgoing],
    });
  });

  it('drops a request naming neither party rather than crashing', () => {
    // Should not happen given RLS (reads are scoped to the caller's own rows), but
    // a row that names neither party is simply not ours to act on -- excluding it
    // from every bucket is the sane, non-crashing behaviour.
    const unrelated = request({ id: 'r1', requesterId: FRIEND_A, addresseeId: FRIEND_B, status: 'pending' });
    expect(partitionFriendRequests([unrelated], ME)).toEqual({ accepted: [], incoming: [], outgoing: [] });
  });
});

describe('otherPartyId', () => {
  it('returns the addressee when I am the requester', () => {
    const req = request({ requesterId: ME, addresseeId: FRIEND_A });
    expect(otherPartyId(req, ME)).toBe(FRIEND_A);
  });

  it('returns the requester when I am the addressee', () => {
    const req = request({ requesterId: FRIEND_A, addresseeId: ME });
    expect(otherPartyId(req, ME)).toBe(FRIEND_A);
  });
});

describe('toFriend', () => {
  const profile: FriendProfileSummary = { id: FRIEND_A, username: 'friend_a', displayName: 'Friend A' };

  it('prefers respondedAt for `since`, falling back to createdAt', () => {
    const responded = request({
      status: 'accepted',
      createdAt: '2026-01-01T00:00:00.000Z',
      respondedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(toFriend(responded, profile).since).toBe('2026-01-02T00:00:00.000Z');

    const notYetResponded = request({ status: 'accepted', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(toFriend(notYetResponded, profile).since).toBe('2026-01-01T00:00:00.000Z');
  });

  it('carries the request id and profile through unchanged', () => {
    const req = request({ id: 'req-xyz', status: 'accepted' });
    expect(toFriend(req, profile)).toEqual({ requestId: 'req-xyz', profile, since: req.createdAt });
  });
});

describe('relationToUser', () => {
  const requests: FriendRequest[] = [
    request({ id: 'r1', requesterId: ME, addresseeId: FRIEND_A, status: 'accepted' }),
    request({ id: 'r2', requesterId: ME, addresseeId: FRIEND_B, status: 'pending' }),
    request({ id: 'r3', requesterId: STRANGER, addresseeId: ME, status: 'pending' }),
  ];

  it('reports friends for an accepted request either way round', () => {
    expect(relationToUser(requests, ME, FRIEND_A)).toBe('friends');
  });

  it('reports outgoing for a pending request I sent', () => {
    expect(relationToUser(requests, ME, FRIEND_B)).toBe('outgoing');
  });

  it('reports incoming for a pending request sent to me', () => {
    expect(relationToUser(requests, ME, STRANGER)).toBe('incoming');
  });

  it('reports none for someone with no request between us', () => {
    expect(relationToUser(requests, ME, 'user-nobody')).toBe('none');
  });

  it('reports none for a declined request, so a fresh add is offered again', () => {
    const declined = [request({ id: 'r1', requesterId: ME, addresseeId: FRIEND_A, status: 'declined' })];
    expect(relationToUser(declined, ME, FRIEND_A)).toBe('none');
  });
});
