import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type FriendProfileSummary,
  type PetState,
  type RecentActivitySignal,
  type SocialPetStatus,
  deriveSocialPetStatus,
  errorMessage,
} from '@vitto/core';
import { friendsService } from '../services/friendsService';
import { FriendPetCard, displayName } from '../components/FriendPetCard';
import { isNightTime } from '../petWorld/timeOfDay';
import { friendsPalette } from '../friendsTheme';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  friendUserIds: string[];
  initialFriendUserId: string;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * A Snapchat-style "browse one friend's pet at a time" screen. `friendUserIds`
 * is the full ordered accepted-friends list from `FriendsScreen`; this screen
 * only ever fetches ONE friend's data at a time (the current index) -- no
 * neighbor prefetching, matching the rest of the codebase's per-screen-load
 * pattern.
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
  // a jarring theme flip.
  const palette = friendsPalette(isNightTime());
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

  return (
    <View style={screenStyle}>
      <Topbar title={displayName(profile)} />
      <Pager />
      {/* `status` is always set by the time we reach here: it's only left
          `null` while `state === 'loading'`, or when `pet` is null (handled
          above). */}
      {status ? <FriendPetCard profile={profile} pet={pet} status={status} palette={palette} /> : null}
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
  messageBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  messageTitle: { ...text.title, fontSize: 20, textAlign: 'center' },
  messageBodyText: { ...text.body, textAlign: 'center' },
});
