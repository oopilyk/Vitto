/**
 * Friend reactions: a fixed set of small cheers (no typing, so nothing to
 * moderate). Stored by `kind`; the words are here, once, for both ends.
 * The table and its limits: supabase/migrations/20261109120000_friend_reactions.sql.
 */
export const REACTION_KINDS = ['high_five', 'cheer', 'proud', 'nudge'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/** On the button. */
export const REACTION_LABEL: Record<ReactionKind, string> = {
  high_five: 'High five',
  cheer: 'Cheer on',
  proud: 'Proud of you',
  nudge: 'Nudge',
};

/** What the receiver reads: "@alex sent you a high five". */
export const REACTION_RECEIVED: Record<ReactionKind, string> = {
  high_five: 'sent you a high five',
  cheer: 'is cheering you on',
  proud: 'is proud of you',
  nudge: 'nudged you to get moving',
};

/** What the sender sees once it went. */
export const REACTION_SENT: Record<ReactionKind, string> = {
  high_five: 'High five sent',
  cheer: 'Cheer sent',
  proud: 'Sent',
  nudge: 'Nudge sent',
};

export interface FriendReaction {
  id: string;
  fromUserId: string;
  kind: ReactionKind;
  createdAt: string;
  seenAt: string | null;
}

/** The server's per-friend daily limit, said plainly. */
export const REACTION_LIMIT_MESSAGE = "That's plenty for today. They'll see the ones you sent.";
