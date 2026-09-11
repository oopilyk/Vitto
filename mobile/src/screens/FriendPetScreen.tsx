import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type RecentActivitySignal,
  type SocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
  daysWithPet,
  deriveSocialPetStatus,
  errorMessage,
} from '@vitto/core';
import { friendsService } from '../services/friendsService';
import { displayName, formatLastActive } from '../components/FriendPetCard';
import { EnvironmentStage } from '../petWorld/EnvironmentStage';
import { LevelRing } from '../petWorld/LevelRing';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { isNightTime } from '../petWorld/timeOfDay';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { ENVIRONMENT_LABEL } from '../petWorld/types';
import { placeToEnvironment, visitEnvironments } from '../petWorld/visitEnvironments';
import { friendsPalette, healthToneColor } from '../friendsTheme';
import { colors, fonts, layout, text, world } from '../theme';

interface Props {
  friendUserIds: string[];
  initialFriendUserId: string;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Visiting a friend: their pet, in their room, full-bleed — the same
 * `EnvironmentStage` the user's own pet lives in, dressed with the same art,
 * so a friend's place looks like a place and not a profile card.
 *
 * Read-only by construction. The scenes come from `visitEnvironments`, which
 * strips every control (no hotbar, no "Log meal"), the pet has no tap handler,
 * and `PetAvatar` gets no children — so nothing on this screen can act on a pet
 * the visitor does not own. The pose is set only from a LIVE signal (see
 * `deriveSocialPetStatus`): a friend seen mid-workout is drawn in the gym,
 * working out; a friend who trained three hours ago is at home, idle.
 *
 * `friendUserIds` is the full ordered accepted-friends list from
 * `FriendsScreen`; only ONE friend's data is fetched at a time (the current
 * index) — no neighbour prefetching, matching the rest of the codebase's
 * per-screen-load pattern.
 */
export function FriendPetScreen({ friendUserIds, initialFriendUserId, onClose }: Props) {
  // Falls back to the start of the list rather than crashing if the initial id
  // is somehow no longer in it (e.g. unfriended in the moment between tapping
  // and this screen mounting).
  const [index, setIndex] = useState(() => Math.max(0, friendUserIds.indexOf(initialFriendUserId)));

  const [state, setState] = useState<LoadState>('loading');
  const [pet, setPet] = useState<PetState | null>(null);
  const [profile, setProfile] = useState<FriendProfileSummary | null>(null);
  const [status, setStatus] = useState<SocialPetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentFriendId: string | undefined = friendUserIds[index];
  // Same day/night palette as the friends list, so moving list -> detail is not
  // a jarring theme flip; the room itself switches art on the same clock.
  const night = isNightTime();
  const palette = friendsPalette(night);
  const screenStyle = [layout.screen, { backgroundColor: palette.screenBg }];

  useEffect(() => {
    if (!currentFriendId) return;
    let cancelled = false;
    setState('loading');
    setError(null);
    setStatus(null);

    void (async () => {
      try {
        const [loadedPet, loadedProfile] = await Promise.all([
          friendsService.loadFriendPet(currentFriendId),
          friendsService.loadFriendProfile(currentFriendId),
        ]);
        if (cancelled) return;
        setPet(loadedPet);
        setProfile(loadedProfile);

        if (loadedPet) {
          // Best-effort: an RPC error/network blip here must never take the
          // whole card down with it -- fall back to an empty signal list, which
          // `deriveSocialPetStatus` already treats as "quiet lately".
          let signals: RecentActivitySignal[] = [];
          try {
            signals = await friendsService.loadFriendRecentActivity(currentFriendId);
          } catch {
            signals = [];
          }
          if (cancelled) return;
          setStatus(deriveSocialPetStatus(loadedPet, signals));
        }
        setState('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(errorMessage(cause, "Could not load your friend's pet."));
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentFriendId]);

  const canGoPrev = index > 0;
  const canGoNext = index < friendUserIds.length - 1;
  const goPrev = () => canGoPrev && setIndex((current) => current - 1);
  const goNext = () => canGoNext && setIndex((current) => current + 1);

  const Topbar = ({ title }: { title: string }) => (
    <View style={[styles.topbar, { borderBottomColor: palette.divider }]}>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
        <Text style={styles.backMark}>←</Text>
        <Text style={[styles.backLabel, { color: palette.secondaryText }]}>Friends</Text>
      </Pressable>
      <Text style={[styles.topTitle, { color: palette.primaryText }]}>{title}</Text>
      <View style={styles.back} />
    </View>
  );

  // Pager is always visible (never swipe-only) so this works with mouse/click
  // too -- the product spec explicitly wants desktop/web parity here.
  const Pager = () => (
    <View style={[styles.pager, { borderBottomColor: palette.divider }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous friend"
        disabled={!canGoPrev}
        onPress={goPrev}
        hitSlop={8}
        style={styles.pagerButton}
      >
        <Text style={[styles.pagerLabel, !canGoPrev && styles.pagerLabelDisabled]}>‹ Prev</Text>
      </Pressable>
      <Text style={styles.pagerCount}>
        {friendUserIds.length > 0 ? `${index + 1} / ${friendUserIds.length}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next friend"
        disabled={!canGoNext}
        onPress={goNext}
        hitSlop={8}
        style={styles.pagerButton}
      >
        <Text style={[styles.pagerLabel, !canGoNext && styles.pagerLabelDisabled]}>Next ›</Text>
      </Pressable>
    </View>
  );

  if (friendUserIds.length === 0 || !currentFriendId) {
    return (
      <View style={screenStyle}>
        <Topbar title="Friends" />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>No friends to browse</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>Add a friend from the Friends list to see their pet here.</Text>
        </View>
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={screenStyle}>
        <Topbar title="Loading..." />
        <Pager />
        <View style={[screenStyle, styles.center]}>
          <ActivityIndicator color={colors.coral} />
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={screenStyle}>
        <Topbar title="Friend" />
        <Pager />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>Could not load this pet</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>{error}</Text>
        </View>
      </View>
    );
  }

  // RLS defensively denies both reads at once when a friendship has just been
  // revoked (unfriended from either side, or a request never actually got
  // accepted) -- treated the same as "no longer connected" rather than as an
  // error, since nothing actually went wrong.
  if (!profile) {
    return (
      <View style={screenStyle}>
        <Topbar title="Friend" />
        <Pager />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>You're not connected anymore</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>
            This person is no longer sharing their pet with you.
          </Text>
        </View>
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={screenStyle}>
        <Topbar title={displayName(profile)} />
        <Pager />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>No pet yet</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>{displayName(profile)} hasn't adopted a pet yet.</Text>
        </View>
      </View>
    );
  }

  // `status` is always set by the time we reach here: it's only left `null`
  // while `state === 'loading'`, or when `pet` is null (handled above).
  if (!status) return null;

  return (
    <Visit
      pet={pet}
      profile={profile}
      status={status}
      night={night}
      onClose={onClose}
      pager={{ index, total: friendUserIds.length, canGoPrev, canGoNext, goPrev, goNext }}
    />
  );
}

interface VisitProps {
  pet: PetState;
  profile: FriendProfileSummary;
  status: SocialPetStatus;
  night: boolean;
  onClose: () => void;
  pager: {
    index: number;
    total: number;
    canGoPrev: boolean;
    canGoNext: boolean;
    goPrev: () => void;
    goNext: () => void;
  };
}

/** The friend's room, with a visitor's HUD over it. Split out so the stage and its chrome are one unit. */
function Visit({ pet, profile, status, night, onClose, pager }: VisitProps) {
  // Built once per visit rather than per render: each dressing is a tree of
  // backdrop elements, and the stage crossfades between them by identity.
  const environments = useMemo(() => visitEnvironments(), []);
  const environment = placeToEnvironment(status.place);

  // Only a live signal may pose the pet — a recent-but-stale activity must
  // never be shown as if it is happening right now.
  const pose = status.isLive ? SOCIAL_ACTIVITY_POSE[status.activity] : undefined;
  const activityProps = {
    ...IDLE_ACTIVITY,
    isEating: pose === 'eating',
    isWorkingOut: pose === 'workout',
    isExploring: pose === 'exploring',
  };

  const healthColor = healthToneColor(status.health.tone, friendsPalette(night));
  const dayLabel = `DAY ${daysWithPet(pet)}`;

  return (
    <View style={styles.visit}>
      <EnvironmentStage
        environment={environment}
        pet={pet}
        activityProps={activityProps}
        night={night}
        environments={environments}
        hudOverlay={
          <View style={styles.hud} pointerEvents="box-none">
            <View style={styles.hudRow} pointerEvents="box-none">
              {/* Left column: whose place this is, then the way home. Same
                  width as the home HUD's ring column so the centre plate lands
                  on the true centre. */}
              <View style={styles.hudSide}>
                <LevelRing level={pet.level} xpPct={pet.xp} onPress={() => {}} night={night} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to friends"
                  onPress={onClose}
                  hitSlop={8}
                  style={({ pressed }) => [
                    retro.panelQuiet,
                    night && retro.panelQuietNight,
                    styles.backButton,
                    pressed && retroPressed,
                  ]}
                >
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.visitBackLabel]}>← Friends</Text>
                </Pressable>
              </View>

              <View style={styles.hudCenter} pointerEvents="none">
                <View style={[retro.panel, night && retro.panelNight, styles.plate]}>
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.plateKicker]} numberOfLines={1}>
                    {`Visiting ${displayName(profile)}`}
                  </Text>
                  <Text style={[styles.plateName, night && retro.labelNight]} numberOfLines={1}>
                    {pet.name.toUpperCase()}
                  </Text>
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.plateRoom]} numberOfLines={1}>
                    {ENVIRONMENT_LABEL[environment].toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.feeling, night && styles.feelingNight]} numberOfLines={2}>
                  {status.headline}
                </Text>
                <Text style={[styles.meta, night && styles.metaNight]}>
                  {dayLabel}
                  <Text style={{ color: healthColor }}>{`   ·   ${status.health.label.toUpperCase()}`}</Text>
                  {/* Only when nothing is live: a live signal is already the
                      pose, and "Active just now" under it would be noise. */}
                  {!status.isLive && status.lastActiveAt ? (
                    <Text style={styles.metaSoft}>{`   ·   Active ${formatLastActive(status.lastActiveAt)}`}</Text>
                  ) : null}
                </Text>
              </View>

              {/* Right column: the pager as two discs, with the count between.
                  Always visible, never swipe-only, so it works with a mouse. */}
              <View style={[styles.hudSide, styles.hudSideRight]} pointerEvents="box-none">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous friend"
                  disabled={!pager.canGoPrev}
                  onPress={pager.goPrev}
                  hitSlop={8}
                  style={({ pressed }) => [
                    retro.panel,
                    night && retro.panelNight,
                    styles.disc,
                    !pager.canGoPrev && styles.discDisabled,
                    pressed && retroPressed,
                  ]}
                >
                  <Text style={[styles.discMark, night && retro.labelNight]}>‹</Text>
                </Pressable>
                <Text style={[retro.kicker, night && retro.kickerNight, styles.visitCount]}>
                  {pager.total > 0 ? `${pager.index + 1} / ${pager.total}` : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next friend"
                  disabled={!pager.canGoNext}
                  onPress={pager.goNext}
                  hitSlop={8}
                  style={({ pressed }) => [
                    retro.panel,
                    night && retro.panelNight,
                    styles.disc,
                    !pager.canGoNext && styles.discDisabled,
                    pressed && retroPressed,
                  ]}
                >
                  <Text style={[styles.discMark, night && retro.labelNight]}>›</Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 16 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  pagerButton: { paddingVertical: 4, paddingHorizontal: 6 },
  pagerLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.coral, letterSpacing: 0.4 },
  pagerLabelDisabled: { color: colors.faint },
  pagerCount: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  // The visit: a full-bleed stage with the visitor's chrome laid over it. The
  // column widths and inset match `PetWorldHud` so moving between your own
  // room and a friend's does not jump the plate around.
  visit: { flex: 1 },
  hud: { flex: 1 },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
  },
  hudSide: { width: 96, alignItems: 'flex-start', gap: 10 },
  hudSideRight: { alignItems: 'flex-end' },
  hudCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  backButton: { paddingHorizontal: 10, paddingVertical: 6 },
  visitBackLabel: { fontSize: 10 },
  plate: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, alignItems: 'center', maxWidth: '100%' },
  plateKicker: { fontSize: 9, marginBottom: 1 },
  plateName: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700', letterSpacing: 1, color: world.ink },
  plateRoom: { fontSize: 9, marginTop: 2 },
  feeling: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.2,
    color: '#241a11',
    textAlign: 'center',
    marginTop: 10,
    textShadowColor: 'rgba(247,240,224,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feelingNight: { color: '#f4ecda', textShadowColor: 'rgba(0,0,0,0.55)' },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#4a3c2b',
    textAlign: 'center',
    marginTop: 5,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(247,240,224,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  metaNight: { color: '#cdbfa6', textShadowColor: 'rgba(0,0,0,0.5)' },
  metaSoft: { fontWeight: '400', textTransform: 'none' },
  visitCount: { fontSize: 10 },
  disc: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  discDisabled: { opacity: 0.35 },
  discMark: { fontFamily: fonts.mono, fontSize: 22, fontWeight: '700', color: world.ink, marginTop: -2 },
  messageBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  messageTitle: { ...text.title, fontSize: 20, textAlign: 'center' },
  messageBodyText: { ...text.body, textAlign: 'center' },
});
