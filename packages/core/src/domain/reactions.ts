/**
 * Friend reactions: a fixed set of small cheers (no typing, so nothing to
 * moderate). Stored by `kind`; the words are here, once, for both ends.
 * The table and its limits: supabase/migrations/20261109120000_friend_reactions.sql.
 */
import { t, tx } from '../i18n';

export const REACTION_KINDS = ['high_five', 'cheer', 'proud', 'nudge'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/** On the button. */
export const REACTION_LABEL: Record<ReactionKind, string> = {
  high_five: t('High five'),
  cheer: t('Cheer on'),
  proud: t('Proud of you'),
  nudge: t('Nudge'),
};

/**
 * What the receiver reads after the sender's name: "@alex sent you a high five".
 *
 * @deprecated Half a sentence, which cannot be translated: left in English and
 * no longer drawn. Use `reactionReceived`.
 */
export const REACTION_RECEIVED: Record<ReactionKind, string> = {
  high_five: 'sent you a high five',
  cheer: 'is cheering you on',
  proud: 'is proud of you',
  nudge: 'nudged you to get moving',
};

/** What the receiver reads, as one sentence: "@alex sent you a high five". */
export const reactionReceived = (kind: ReactionKind, name: string): string => {
  switch (kind) {
    case 'high_five':
      return t('{name} sent you a high five', { name });
    case 'cheer':
      return t('{name} is cheering you on', { name });
    case 'proud':
      return t('{name} is proud of you', { name });
    case 'nudge':
      return t('{name} nudged you to get moving', { name });
  }
};

/** What the sender sees once it went. */
export const REACTION_SENT: Record<ReactionKind, string> = {
  high_five: t('High five sent'),
  cheer: t('Cheer sent'),
  proud: tx('a reaction to a friend has been sent', 'Sent'),
  nudge: t('Nudge sent'),
};

export interface FriendReaction {
  id: string;
  fromUserId: string;
  kind: ReactionKind;
  createdAt: string;
  seenAt: string | null;
}

/** The server's per-friend daily limit, said plainly. */
export const REACTION_LIMIT_MESSAGE = t("That's plenty for today. They'll see the ones you sent.");
