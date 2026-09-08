import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type FriendProfileSummary, type PetState, errorMessage } from '@vitto/core';
import { friendsService } from '../services/friendsService';
import { PetAvatar } from '../components/PetAvatar';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  friendUserId: string;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

const displayName = (profile: FriendProfileSummary): string =>
  profile.displayName || `@${profile.username}`;

/**
 * A friend's pet, read-only: rendered via the same `PetAvatar` the dashboard
 * uses for the signed-in user's own pet, with every activity flag false and no
 * `children` -- so no HUD button, no feed/train affordance renders at all. See
 * `mobile/src/components/PetAvatar.tsx`: every mutation trigger lives in the
 * parent screen, never inside the component itself, so this is genuinely
 * view-only rather than a read-only mode bolted on top of an editable one.
 */
export function FriendPetScreen({ friendUserId, onClose }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [pet, setPet] = useState<PetState | null>(null);
  const [profile, setProfile] = useState<FriendProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);

    void (async () => {
      try {
        const [loadedPet, loadedProfile] = await Promise.all([
          friendsService.loadFriendPet(friendUserId),
          friendsService.loadFriendProfile(friendUserId),
        ]);
        if (cancelled) return;
        setPet(loadedPet);
        setProfile(loadedProfile);
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
  }, [friendUserId]);

  const Topbar = ({ title }: { title: string }) => (
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
        <Text style={styles.backMark}>←</Text>
        <Text style={styles.backLabel}>Friends</Text>
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={styles.back} />
    </View>
  );

  if (state === 'loading') {
    return (
      <View style={layout.screen}>
        <Topbar title="Loading..." />
        <View style={[layout.screen, styles.center]}>
          <ActivityIndicator color={colors.coral} />
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={layout.screen}>
        <Topbar title="Friend" />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={styles.messageTitle}>Could not load this pet</Text>
          <Text style={styles.messageBodyText}>{error}</Text>
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
      <View style={layout.screen}>
        <Topbar title="Friend" />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={styles.messageTitle}>You're not connected anymore</Text>
          <Text style={styles.messageBodyText}>
            This person is no longer sharing their pet with you.
          </Text>
        </View>
      </View>
    );
  }

  if (!pet) {
    return (
      <View style={layout.screen}>
        <Topbar title={displayName(profile)} />
        <View style={[styles.center, styles.messageBody]}>
          <Text style={styles.messageTitle}>No pet yet</Text>
          <Text style={styles.messageBodyText}>{displayName(profile)} hasn't adopted a pet yet.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={layout.screen}>
      <Topbar title={displayName(profile)} />
      <PetAvatar
        pet={pet}
        isAnalyzingMeal={false}
        isEating={false}
        feedingImage={null}
        feedingGrade={null}
        isCelebrating={false}
        isWorkingOut={false}
        isExploring={false}
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
  messageBody: { flex: 1, paddingHorizontal: 32, gap: 10 },
  messageTitle: { ...text.title, fontSize: 20, textAlign: 'center' },
  messageBodyText: { ...text.body, textAlign: 'center' },
});
