import { StyleSheet, Text, View } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type SocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
} from '@vitto/core';
import { PetAvatar } from './PetAvatar';
import { FRIENDS_LIGHT, type FriendsPalette, healthToneColor } from '../friendsTheme';
import { colors, fonts, text } from '../theme';

interface FriendPetCardProps {
  profile: FriendProfileSummary;
  pet: PetState;
  status: SocialPetStatus;
  /** Day/night palette from `FriendPetScreen`; defaults to the light one. */
  palette?: FriendsPalette;
}

/** A short room glyph for the location line -- keeps it recognisable at a glance. */
const PLACE_GLYPH: Record<SocialPetStatus['place'], string> = {
  home: '🏠',
  kitchen: '🍳',
  gym: '🏋️',
  outdoors: '🌳',
  study: '📚',
};

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
export function FriendPetCard({ profile, pet, status, palette = FRIENDS_LIGHT }: FriendPetCardProps) {
  const pose = status.isLive ? SOCIAL_ACTIVITY_POSE[status.activity] : undefined;
  const healthColor = healthToneColor(status.health.tone, palette);

  return (
    <View style={styles.container}>
      <Text style={[styles.name, { color: palette.primaryText }]}>{displayName(profile)}</Text>
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
          <Text style={[styles.healthChipLabel, { color: healthColor }]}>{status.health.label}</Text>
        </View>
      </View>
      {/* Location is inferred from the latest LIVE activity -- "At home"
          whenever nothing live is happening (see `deriveSocialPetStatus`). */}
      <Text style={[styles.place, { color: palette.secondaryText }]}>
        {PLACE_GLYPH[status.place]} {status.placeLabel}
      </Text>
      {!status.isLive && status.lastActiveAt ? (
        <Text style={[styles.lastActive, { color: palette.secondaryText }]}>
          Active {formatLastActive(status.lastActiveAt)}
        </Text>
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
  healthChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  healthChipLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.3 },
  place: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.3, textAlign: 'center', marginTop: 10 },
  lastActive: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, textAlign: 'center', marginTop: 6 },
});
