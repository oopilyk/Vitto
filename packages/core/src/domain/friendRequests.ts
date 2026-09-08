import type { Friend, FriendProfileSummary, FriendRequest } from './friends';

/**
 * `FriendRequest[]` sorted into the three shapes a friends screen actually draws.
 * A declined request is dropped from all three -- it is history, not something
 * left to act on. (A fresh request after a decline is a new row with `status:
 * 'pending'`, per the unique-index comment in the friend_requests migration.)
 */
export interface PartitionedFriendRequests {
  accepted: FriendRequest[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/**
 * Splits the caller's `friend_requests` rows into accepted friends, requests
 * waiting on the caller to answer (incoming), and requests the caller is waiting
 * on someone else to answer (outgoing).
 *
 * RLS scopes `loadMyFriendRequests` to rows the caller is part of, so a request
 * naming neither party should never reach this function -- but if one does, it
 * is simply not the caller's to act on, and is dropped from every bucket rather
 * than throwing.
 */
export const partitionFriendRequests = (
  requests: FriendRequest[],
  currentUserId: string,
): PartitionedFriendRequests => {
  const accepted: FriendRequest[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];

  for (const request of requests) {
    const isRequester = request.requesterId === currentUserId;
    const isAddressee = request.addresseeId === currentUserId;
    if (!isRequester && !isAddressee) continue;
    if (request.status === 'declined') continue;

    if (request.status === 'accepted') {
      accepted.push(request);
    } else if (isAddressee) {
      incoming.push(request);
    } else {
      outgoing.push(request);
    }
  }

  return { accepted, incoming, outgoing };
};

/** The id of whichever party in the request is not the caller. */
export const otherPartyId = (request: FriendRequest, currentUserId: string): string =>
  request.requesterId === currentUserId ? request.addresseeId : request.requesterId;

/**
 * Combines an accepted request with the other party's already-fetched profile
 * into the `Friend` shape the friends list renders. `since` prefers the moment
 * the request was answered over when it was first sent, since that is when the
 * two accounts actually became friends.
 */
export const toFriend = (request: FriendRequest, profile: FriendProfileSummary): Friend => ({
  requestId: request.id,
  profile,
  since: request.respondedAt ?? request.createdAt,
});

/**
 * Where the caller stands with another user, given their own `friend_requests`
 * rows -- drives whether a search result shows "Add", "Requested", "Friends", or
 * nothing actionable. A declined request reads as `'none'`, the same as no
 * request at all, so a fresh add is offered again rather than stuck on history.
 */
export type FriendRequestRelation = 'none' | 'friends' | 'outgoing' | 'incoming';

export const relationToUser = (
  requests: FriendRequest[],
  currentUserId: string,
  otherUserId: string,
): FriendRequestRelation => {
  const match = requests.find(
    (request) =>
      request.status !== 'declined' &&
      ((request.requesterId === currentUserId && request.addresseeId === otherUserId) ||
        (request.requesterId === otherUserId && request.addresseeId === currentUserId)),
  );
  if (!match) return 'none';
  if (match.status === 'accepted') return 'friends';
  return match.requesterId === currentUserId ? 'outgoing' : 'incoming';
};
