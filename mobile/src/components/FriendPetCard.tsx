import { StyleSheet, Text, View } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type SocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
} from '@vitto/core';
import { PetAvatar } from './PetAvatar';
import { colors, fonts, text } from '../theme';

interface FriendPetCardProps {
  profile: FriendProfileSummary;
  pet: PetState;
  status: SocialPetStatus;
}

export const displayName = (profile: FriendProfileSummary): string =>
  profile.displayName || `@${profile.username}`;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A short, house-style relative-time string ("2h ago", "Yesterday", "3d ago"),
 * matching the tone `PetStatsScreen`'s "Last cared for" line already uses.
 * Kept local rather than promoted to a shared utility -- this is the only
 * place in the app that needs it, per YAGNI.
 */
const formatLastActive = (iso: string, now: Date = new Date()): string => {
  const elapsedMs = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (elapsedMs < MINUTE_MS) return 'Just now';
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m ago`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h ago`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
};

/**
 * One friend's pet, read-only -- the focal card of the sequential browser in
 * `FriendPetScreen`. Only ever set an activity pose when `status.isLive`: a
 * recent-but-not-live activity must never be shown as if it is happening right
 * now (see `deriveSocialPetStatus` in `@vitto/core`).
 */
export function FriendPetCard({ profile, pet, status }: FriendPetCardProps) {
  const pose = status.isLive ? SOCIAL_ACTIVITY_POSE[status.activity] : undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{displayName(profile)}</Text>
      <PetAvatar
        pet={pet}
        isAnalyzingMeal={false}
        isEating={pose === 'eating'}
        feedingImage={null}
        feedingGrade={null}
        isCelebrating={false}
        isWorkingOut={pose === 'workout'}
        isExploring={pose === 'exploring'}
      />
      <View style={styles.statusRow}>
        <Text style={styles.headline}>{status.headline}</Text>
        {status.moodLabel ? (
          <View style={styles.moodChip}>
            <Text style={styles.moodChipLabel}>{status.moodLabel}</Text>
          </View>
        ) : null}
      </View>
      {!status.isLive && status.lastActiveAt ? (
        <Text style={styles.lastActive}>Active {formatLastActive(status.lastActiveAt)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  name: { ...text.heading, fontSize: 18, textAlign: 'center', marginTop: 16 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  headline: { fontSize: 14, fontWeight: '600', color: colors.ink },
  moodChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.sageSoft,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  moodChipLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.3, color: colors.mintDeep },
  lastActive: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, textAlign: 'center', marginTop: 6 },
});
