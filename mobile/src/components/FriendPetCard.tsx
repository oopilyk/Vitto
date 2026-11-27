import { Text, View } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type SocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
} from '@vitto/core';
import { PetAvatar } from './PetAvatar';
import { FRIENDS_LIGHT, type FriendsPalette, healthToneColor } from '../friendsTheme';
import { colors, fonts, text, themedStyles } from '../theme';
import { t } from '../i18n';

interface FriendPetCardProps {
  profile: FriendProfileSummary;
  pet: PetState;
  status: SocialPetStatus;
  /** Day/night palette from `FriendPetScreen`; defaults to the light one. */
  palette?: FriendsPalette;
}


/**
 * What a friend is called, everywhere they appear: their handle.
 *
 * Kept as the one helper so the friends list, a friend's pet screen and the
 * visiting banner cannot disagree. The free-text name is only the fallback for
 * someone who has not claimed a handle yet.
 */
export const displayName = (profile: FriendProfileSummary): string =>
  (profile.username ? `@${profile.username}` : profile.displayName) || profile.id;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A short, house-style relative-time string ("2h ago", "Yesterday", "3d ago"),
 * matching the tone `PetStatsScreen`'s "Last cared for" line already uses.
 * Kept local rather than promoted to a shared utility -- this is the only
 * place in the app that needs it, per YAGNI.
 */
export const formatLastActive = (iso: string, now: Date = new Date()): string => {
  const elapsedMs = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (elapsedMs < MINUTE_MS) return t('Just now');
  if (elapsedMs < HOUR_MS) return t('{minutes}m ago', { minutes: Math.floor(elapsedMs / MINUTE_MS) });
  if (elapsedMs < DAY_MS) return t('{hours}h ago', { hours: Math.floor(elapsedMs / HOUR_MS) });
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? t('Yesterday') : t('{days}d ago', { days });
};

/**
 * The same time as the whole line it is shown in ("Active 2h ago"). A sentence
 * of its own rather than "Active " in front of `formatLastActive`: another
 * language does not put the two in that order.
 */
export const formatActive = (iso: string, now: Date = new Date()): string => {
  const elapsedMs = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (elapsedMs < MINUTE_MS) return t('Active Just now');
  if (elapsedMs < HOUR_MS) return t('Active {minutes}m ago', { minutes: Math.floor(elapsedMs / MINUTE_MS) });
  if (elapsedMs < DAY_MS) return t('Active {hours}h ago', { hours: Math.floor(elapsedMs / HOUR_MS) });
  const days = Math.floor(elapsedMs / DAY_MS);
  return days === 1 ? t('Active Yesterday') : t('Active {days}d ago', { days });
};

/**
 * One friend's pet, read-only -- the focal card of the sequential browser in
 * `FriendPetScreen`. Only ever set an activity pose when `status.isLive`: a
 * recent-but-not-live activity must never be shown as if it is happening right
 * now (see `deriveSocialPetStatus` in `@vitto/core`).
 */
export function FriendPetCard({ profile, pet, status, palette = FRIENDS_LIGHT }: FriendPetCardProps) {
  const pose = status.isLive ? SOCIAL_ACTIVITY_POSE[status.activity] : undefined;
  const healthColor = healthToneColor(status.health.tone, palette);

  return (
    <View style={styles.container}>
      <Text style={[styles.name, { color: palette.primaryText }]} numberOfLines={2}>
        {displayName(profile)}
      </Text>
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
        <Text style={[styles.headline, { color: palette.primaryText }]}>{status.headline}</Text>
        {/* Health, not the deprecated `moodLabel`: always set (down to a plain
            "Healthy") and carries a tone to colour by. */}
        <View style={[styles.healthChip, { borderColor: healthColor }]}>
          <Text style={[styles.healthChipLabel, { color: healthColor }]} numberOfLines={1}>
            {status.health.label}
          </Text>
        </View>
      </View>
      {/* Location is inferred from the latest LIVE activity -- "At home"
          whenever nothing live is happening (see `deriveSocialPetStatus`). */}
      <Text style={[styles.place, { color: palette.secondaryText }]}>
        {status.placeLabel}
      </Text>
      {!status.isLive && status.lastActiveAt ? (
        <Text style={[styles.lastActive, { color: palette.secondaryText }]}>
          {formatActive(status.lastActiveAt)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1 },
  name: { ...text.heading, fontSize: 23, textAlign: 'center', marginTop: 16 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  headline: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink, flexShrink: 1 },
  healthChip: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  healthChipLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0 },
  place: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0, textAlign: 'center', marginTop: 10 },
  lastActive: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: 6 },
}));
