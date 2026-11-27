import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type RecentActivitySignal,
  type SocialPetStatus,
  SOCIAL_ACTIVITY_POSE,
  daysWithPet,
  deriveSocialPetStatus,
  errorMessage,
  REACTION_KINDS,
  REACTION_LABEL,
  REACTION_SENT,
  type ReactionKind,
} from '@vitto/core';
import { haptic } from '../components/ui';
import { askReportOrBlock } from '../components/safetyActions';
import { friendsService } from '../services/friendsService';
import { displayName, formatActive } from '../components/FriendPetCard';
import { EnvironmentStage } from '../petWorld/EnvironmentStage';
import { LevelRing } from '../petWorld/LevelRing';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { topInsetFor } from '../petWorld/chromeScale';
import { FitText } from '../components/FitText';
import { isNightTime } from '../petWorld/timeOfDay';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { ENVIRONMENT_LABEL } from '../petWorld/types';
import { placeToEnvironment, visitEnvironments } from '../petWorld/visitEnvironments';
import { friendsPalette, healthToneColor } from '../friendsTheme';
import { colors, fonts, layout, text, world, themedStyles } from '../theme';
import { t, tx } from '../i18n';

interface Props {
  friendUserIds: string[];
  initialFriendUserId: string;
  onClose: () => void;
}

interface VisitData {
  pet: PetState | null;
  profile: FriendProfileSummary | null;
  /** Set whenever `pet` is. */
  status: SocialPetStatus | null;
}

interface VisitEntry {
  data?: VisitData;
  error?: string;
  at: number;
  pending?: Promise<void>;
}

/**
 * Every friend's visit, fetched once and kept for the session: what makes
 * paging between friends instant. Kept for a minute before it is fetched
 * again, and the old one stays on screen while that happens.
 */
const visits = new Map<string, VisitEntry>();
const FRESH_MS = 60_000;
/** How many friends either side of the one showing are fetched ahead. */
const AHEAD = 3;

/** For tests: start with nothing fetched. */
export const forgetFriendVisits = () => visits.clear();

const fetchVisit = async (friendId: string): Promise<VisitData> => {
  const [pet, profile] = await Promise.all([friendsService.loadFriendPet(friendId), friendsService.loadFriendProfile(friendId)]);
  if (!pet) return { pet, profile, status: null };
  // Best-effort: an RPC error/network blip here must never take the whole
  // card down with it -- an empty signal list reads as "quiet lately".
  const signals: RecentActivitySignal[] = await friendsService.loadFriendRecentActivity(friendId).catch(() => []);
  return { pet, profile, status: deriveSocialPetStatus(pet, signals) };
};

/** Told whenever a visit lands: the open screen redraws. */
const listeners = new Set<() => void>();

/** Fetches a friend's visit unless a fresh one is kept or on its way. */
const ensureVisit = (friendId: string): void => {
  const kept = visits.get(friendId);
  if (kept?.pending || (kept?.data && Date.now() - kept.at < FRESH_MS)) return;
  const pending = fetchVisit(friendId).then(
    (data) => void visits.set(friendId, { data, at: Date.now() }),
    // A failed refresh keeps what was there; only a first fetch shows the error.
    (cause) => void visits.set(friendId, kept?.data ? { data: kept.data, at: kept.at } : { error: errorMessage(cause, t("Could not load your friend's pet.")), at: Date.now() }),
  );
  visits.set(friendId, { ...kept, at: kept?.at ?? 0, pending: pending.then(() => listeners.forEach((listener) => listener())) });
};

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
 * `FriendsScreen`. Every friend near the one showing is fetched as soon as the
 * screen opens and kept (see `visits`), so moving between them is instant:
 * no spinner between friends, and none on coming back within a minute.
 */
export function FriendPetScreen({ friendUserIds, initialFriendUserId, onClose }: Props) {
  // Falls back to the start of the list rather than crashing if the initial id
  // is somehow no longer in it (e.g. unfriended in the moment between tapping
  // and this screen mounting).
  const [index, setIndex] = useState(() => Math.max(0, friendUserIds.indexOf(initialFriendUserId)));
  // Redrawn whenever a fetched visit lands.
  const [, landed] = useReducer((count: number) => count + 1, 0);

  const currentFriendId: string | undefined = friendUserIds[index];
  const [sending, setSending] = useState<ReactionKind | null>(null);
  const [reactionNote, setReactionNote] = useState<string | null>(null);
  useEffect(() => setReactionNote(null), [currentFriendId]);
  /** True once it is sent; a refusal (the day's limit, no connection) is said in the note. */
  const react = async (kind: ReactionKind): Promise<boolean> => {
    if (!currentFriendId) return false;
    setSending(kind);
    try {
      await friendsService.sendReaction(currentFriendId, kind);
      haptic('press');
      setReactionNote(profile ? t('{sent} to {name}', { sent: REACTION_SENT[kind], name: displayName(profile) }) : REACTION_SENT[kind]);
      return true;
    } catch (cause) {
      setReactionNote(errorMessage(cause, t('Could not send that.')));
      return false;
    } finally {
      setSending(null);
    }
  };
  // The page around the room (its bar, its messages) is in the app's
  // appearance, as the friends list is, so moving list -> detail is not a
  // jarring theme flip. The room itself switches art on the clock.
  const night = isNightTime();
  const palette = friendsPalette();
  const screenStyle = [layout.screen, { backgroundColor: palette.screenBg }];

  // This friend first, then outwards either side, so the next swipe is ready.
  useEffect(() => {
    listeners.add(landed);
    return () => void listeners.delete(landed);
  }, []);
  useEffect(() => {
    for (let step = 0; step <= AHEAD; step += 1) {
      for (const at of step === 0 ? [index] : [index + step, index - step]) {
        const id = friendUserIds[at];
        if (id) ensureVisit(id);
      }
    }
  }, [index, friendUserIds]);

  const entry = currentFriendId ? visits.get(currentFriendId) : undefined;
  const pet = entry?.data?.pet ?? null;
  const profile = entry?.data?.profile ?? null;
  const status = entry?.data?.status ?? null;
  const state: 'loading' | 'ready' | 'error' = entry?.data ? 'ready' : entry?.error ? 'error' : 'loading';
  const error = entry?.error ?? null;

  const canGoPrev = index > 0;
  const canGoNext = index < friendUserIds.length - 1;
  const goPrev = () => canGoPrev && setIndex((current) => current - 1);
  const goNext = () => canGoNext && setIndex((current) => current + 1);

  const Topbar = ({ title }: { title: string }) => (
    <View style={[styles.topbar, { borderBottomColor: palette.divider }]}>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
        <Text style={styles.backMark}>‹</Text>
        <Text style={[styles.backLabel, { color: palette.secondaryText }]}>{t('Friends')}</Text>
      </Pressable>
      <Text style={[styles.topTitle, { color: palette.primaryText }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.back} />
    </View>
  );

  // Pager is always visible (never swipe-only) so this works with mouse/click
  // too -- the product spec explicitly wants desktop/web parity here.
  const Pager = () => (
    <View style={[styles.pager, { borderBottomColor: palette.divider }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Previous friend')}
        disabled={!canGoPrev}
        onPress={goPrev}
        hitSlop={8}
        style={styles.pagerButton}
      >
        <Text style={[styles.pagerLabel, !canGoPrev && styles.pagerLabelDisabled]}>{t('‹ Prev')}</Text>
      </Pressable>
      <Text style={styles.pagerCount}>
        {friendUserIds.length > 0 ? `${index + 1} / ${friendUserIds.length}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Next friend')}
        disabled={!canGoNext}
        onPress={goNext}
        hitSlop={8}
        style={styles.pagerButton}
      >
        <Text style={[styles.pagerLabel, !canGoNext && styles.pagerLabelDisabled]}>{t('Next ›')}</Text>
      </Pressable>
    </View>
  );

  if (friendUserIds.length === 0 || !currentFriendId) {
    return (
      <View style={screenStyle}>
        <Topbar title={t('Friends')} />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>{t('No friends to browse')}</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>{t('Add a friend from the Friends list to see their pet here.')}</Text>
        </View>
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={screenStyle}>
        <Topbar title={t('Loading...')} />
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
        <Topbar title={t('Friend')} />
        <Pager />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>{t('Could not load this pet')}</Text>
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
        <Topbar title={t('Friend')} />
        <Pager />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>{t("You're not connected anymore")}</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>
            {t('This person is no longer sharing their pet with you.')}
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
          <Text style={[styles.messageTitle, { color: palette.primaryText }]}>{t('No pet yet')}</Text>
          <Text style={[styles.messageBodyText, { color: palette.secondaryText }]}>{t("{name} hasn't adopted a pet yet.", { name: displayName(profile) })}</Text>
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
      reaction={{ sending, note: reactionNote, send: react }}
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
  /** Sending a reaction to this friend (see friendsService.sendReaction). */
  reaction: { sending: ReactionKind | null; note: string | null; send: (kind: ReactionKind) => Promise<boolean> };
}

/** The home HUD's measures (see PetWorldHud), so a friend's place is laid out like your own. */
const GUTTER = 16;
const RING = 64;
const DISC = 44;
const TOOL = 36;
/** How far a swipe has to travel to move to the next friend. */
const SWIPE = 50;
/** How long a reaction's button says "Sent". */
const SENT_MS = 1600;

/**
 * The friend's room, with a visitor's HUD over it laid out row for row like
 * the home screen's: the level ring, the name plate and a round button on top,
 * the pet's line on a plaque across the width, then the way between friends.
 * A sideways swipe anywhere on the room moves to the next or previous friend.
 */
function Visit({ pet, profile, status, night, onClose, pager, reaction }: VisitProps) {
  const { sending, note: reactionNote, send: react } = reaction;
  // Built once per visit rather than per render: each dressing is a tree of
  // backdrop elements, and the stage crossfades between them by identity.
  const environments = useMemo(() => visitEnvironments(), []);
  const environment = placeToEnvironment(status.place);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const topInset = topInsetFor(screenWidth, screenHeight);

  // Only a live signal may pose the pet — a recent-but-stale activity must
  // never be shown as if it is happening right now.
  const pose = status.isLive ? SOCIAL_ACTIVITY_POSE[status.activity] : undefined;
  const activityProps = {
    ...IDLE_ACTIVITY,
    isEating: pose === 'eating',
    isWorkingOut: pose === 'workout',
    isExploring: pose === 'exploring',
  };

  // Over the room's art, which is night or day by the clock: the tone that reads on it.
  const healthColor = healthToneColor(status.health.tone, friendsPalette(night));

  // The swipe: the room follows the finger a little, then the next friend
  // slides in from the side it was pulled from.
  const slide = useRef(new Animated.Value(0)).current;
  const pagerNow = useRef(pager);
  pagerNow.current = pager;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_event, gesture) => {
        const { canGoNext, canGoPrev } = pagerNow.current;
        // Against the end of the list it barely gives.
        const open = gesture.dx < 0 ? canGoNext : canGoPrev;
        slide.setValue(gesture.dx * (open ? 0.5 : 0.12));
      },
      onPanResponderRelease: (_event, gesture) => {
        const { canGoNext, canGoPrev, goNext, goPrev } = pagerNow.current;
        if (gesture.dx < -SWIPE && canGoNext) {
          haptic('select');
          goNext();
        } else if (gesture.dx > SWIPE && canGoPrev) {
          haptic('select');
          goPrev();
        } else {
          Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(slide, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;
  // A new friend: in from the side the list moved towards.
  const shownIndex = useRef(pager.index);
  useEffect(() => {
    if (shownIndex.current === pager.index) return;
    const from = pager.index > shownIndex.current ? 1 : -1;
    shownIndex.current = pager.index;
    slide.setValue(from * 60);
    Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pager.index, slide]);
  const fade = slide.interpolate({ inputRange: [-120, 0, 120], outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });

  // A sent reaction's button says so for a moment, then goes back to its name.
  const [sent, setSent] = useState<ReactionKind | null>(null);
  useEffect(() => {
    if (!sent) return undefined;
    const timer = setTimeout(() => setSent(null), SENT_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  // Only once it has really gone: a refused one says why in the note instead.
  const send = async (kind: ReactionKind) => {
    setSent(null);
    if (await react(kind)) setSent(kind);
  };

  return (
    <View style={styles.visit} {...pan.panHandlers}>
      <Animated.View style={[styles.visit, { opacity: fade, transform: [{ translateX: slide }] }]}>
        <EnvironmentStage
          environment={environment}
          pet={pet}
          activityProps={activityProps}
          night={night}
          environments={environments}
          hudOverlay={
            <View style={styles.hud} pointerEvents="box-none">
              {/* Row 1, as at home: level, whose pet and where, and the way out. */}
              <View style={[styles.topRow, { paddingTop: topInset }]} pointerEvents="box-none">
                <View pointerEvents="none">
                  <LevelRing level={pet.level} xpPct={pet.xp} onPress={() => {}} night={night} size={RING} />
                </View>
                <View style={[retro.panel, night && retro.panelNight, styles.plate]} pointerEvents="none">
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.plateKicker]} numberOfLines={1}>
                    {t('Visiting {name}', { name: displayName(profile) })}
                  </Text>
                  <FitText style={[styles.plateName, night && retro.labelNight]} minScale={0.7}>
                    {pet.name.toUpperCase()}
                  </FitText>
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.plateKicker]} numberOfLines={1}>
                    {ENVIRONMENT_LABEL[environment].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.sideSlot} pointerEvents="box-none">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Back to friends')}
                    onPress={onClose}
                    hitSlop={8}
                    style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.disc, pressed && retroPressed]}
                  >
                    <Text style={[styles.discMark, night && retro.labelNight]}>✕</Text>
                  </Pressable>
                </View>
              </View>

              {/* Row 2, the pet's line and how it is doing, on an opaque plaque. */}
              <View style={[retro.panel, night && retro.panelNight, styles.readout]} pointerEvents="none">
                <FitText style={[styles.feeling, night && retro.labelNight]} lines={2} minScale={0.85}>
                  {status.headline}
                </FitText>
                {/* Separate tokens, not one joined line: a wrap falls between them. */}
                <View style={styles.metaRow}>
                  <Text style={[styles.meta, night && retro.captionNight]} numberOfLines={1}>
                    {t('DAY {day}', { day: daysWithPet(pet) })}
                  </Text>
                  <Text style={[styles.meta, { color: healthColor }]} numberOfLines={1}>
                    {status.health.label.toUpperCase()}
                  </Text>
                  {/* Only when nothing is live: a live signal is already the pose. */}
                  {!status.isLive && status.lastActiveAt ? (
                    <Text style={[styles.meta, styles.metaSoft, night && retro.captionNight]} numberOfLines={1}>
                      {formatActive(status.lastActiveAt)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Row 3, between friends. Buttons as well as the swipe, so it works with a mouse. */}
              {pager.total > 1 ? (
                <View style={styles.toolRow} pointerEvents="box-none">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Previous friend')}
                    disabled={!pager.canGoPrev}
                    onPress={pager.goPrev}
                    hitSlop={8}
                    style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, !pager.canGoPrev && styles.pillOff, pressed && retroPressed]}
                  >
                    <Text style={[retro.label, styles.pillLabel, night && retro.labelNight]}>‹</Text>
                  </Pressable>
                  <Text style={[retro.kicker, night && retro.kickerNight, styles.count]} numberOfLines={1}>
                    {t('{index} of {total}', { index: pager.index + 1, total: pager.total })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Next friend')}
                    disabled={!pager.canGoNext}
                    onPress={pager.goNext}
                    hitSlop={8}
                    style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.pill, !pager.canGoNext && styles.pillOff, pressed && retroPressed]}
                  >
                    <Text style={[retro.label, styles.pillLabel, night && retro.labelNight]}>›</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
        />
      </Animated.View>

      {/* Reactions: a quick word to the friend whose place this is. */}
      <View style={styles.reactions} pointerEvents="box-none" testID="friend-reactions">
        {reactionNote ? (
          <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.notePill]} pointerEvents="none">
            {/* Wraps rather than cuts off: a refusal from the server can be a whole sentence. */}
            <Text style={[retro.label, styles.noteLabel, night && retro.labelNight]} accessibilityLiveRegion="polite" numberOfLines={3}>
              {reactionNote}
            </Text>
          </View>
        ) : null}
        {/* Four buttons of their own, side by side, each the retro panel the HUD's buttons are. */}
        <View style={styles.reactionRow}>
          {REACTION_KINDS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={t('{reaction}, to {name}', { reaction: REACTION_LABEL[kind], name: displayName(profile) })}
              disabled={sending !== null}
              onPress={() => void send(kind)}
              style={({ pressed }) => [
                retro.panel,
                night && retro.panelNight,
                styles.reaction,
                sent === kind && styles.reactionSent,
                pressed && retroPressed,
                sending === kind && styles.reactionSending,
              ]}
            >
              <Text style={[styles.reactionLabel, night && retro.labelNight, sent === kind && styles.reactionLabelSent]} numberOfLines={2}>
                {sent === kind ? tx('a reaction to a friend has been sent', 'Sent') : REACTION_LABEL[kind]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Report or block {name}', { name: displayName(profile) })}
          hitSlop={10}
          onPress={() => askReportOrBlock({ userId: profile.id, name: displayName(profile), onBlocked: onClose })}
          testID="report-or-block"
        >
          <Text style={[retro.kicker, night && retro.kickerNight, styles.reportLink]}>{t('Report or block')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  reactions: { position: 'absolute', left: GUTTER, right: GUTTER, bottom: 30, alignItems: 'center', gap: 8 },
  reactionRow: { flexDirection: 'row', gap: 8, width: '100%', maxWidth: 400 },
  reaction: { flex: 1, minHeight: 48, paddingHorizontal: 4, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  reactionSent: { backgroundColor: '#dbe8c8' },
  reactionSending: { opacity: 0.6 },
  reactionLabel: { fontFamily: fonts.systemMono, fontSize: 10, fontWeight: '700', lineHeight: 13, letterSpacing: 0.5, color: world.ink, textAlign: 'center', textTransform: 'uppercase' },
  reactionLabelSent: { color: '#3f6b2e' },
  notePill: { paddingHorizontal: 14, paddingVertical: 6, maxWidth: '100%' },
  noteLabel: { fontSize: 11, lineHeight: 15, letterSpacing: 0.8, textAlign: 'center' },
  reportLink: { textAlign: 'center', opacity: 0.8, paddingVertical: 4 },
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 64 },
  backMark: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, marginTop: -4, color: colors.coral },
  backLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
  // A friend's name here can be a 40-character display name: it gives way
  // ("…") between the two fixed sides rather than pushing them off.
  topTitle: { ...text.heading, fontSize: 21, flexShrink: 1, minWidth: 0, textAlign: 'center' },
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
  pagerLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.coral, letterSpacing: 0 },
  pagerLabelDisabled: { color: colors.faint },
  pagerCount: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint },
  // The visit: a full-bleed stage with the visitor's chrome laid over it,
  // measured like PetWorldHud so your own room and a friend's line up.
  visit: { flex: 1 },
  hud: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER },
  sideSlot: { width: RING, alignItems: 'flex-end' },
  plate: { flex: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, alignItems: 'center' },
  plateKicker: { fontSize: 10, marginBottom: 1 },
  plateName: { fontFamily: fonts.systemMono, fontSize: 18, fontWeight: '700', letterSpacing: 1, color: world.ink, textAlign: 'center' },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center' },
  discMark: { fontFamily: fonts.systemMono, fontSize: 17, fontWeight: '700', color: world.ink },
  readout: { marginTop: 12, marginHorizontal: GUTTER, alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 9 },
  feeling: { fontFamily: fonts.systemMono, fontSize: 13, fontWeight: '700', lineHeight: 18, letterSpacing: 0.2, color: world.ink, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 10, rowGap: 2, marginTop: 6 },
  meta: {
    flexShrink: 0,
    fontFamily: fonts.systemMono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: world.inkSoft,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  metaSoft: { fontWeight: '400', textTransform: 'none', letterSpacing: 0.4 },
  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, marginTop: 12 },
  pill: { height: TOOL, minWidth: 52, borderRadius: TOOL / 2, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillOff: { opacity: 0.35 },
  pillLabel: { fontSize: 20, lineHeight: 22, marginTop: -2 },
  count: { fontSize: 11 },
  messageBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  messageTitle: { ...text.title, fontSize: 32, lineHeight: 34, textAlign: 'center' },
  messageBodyText: { ...text.body, textAlign: 'center' },
}));
