import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type FriendOverview,
  type FriendProfileSummary,
  type FriendRequest,
  errorMessage,
  otherPartyId,
  partitionFriendRequests,
  relationToUser,
} from '@vitto/core';
import { friendsService } from '../services/friendsService';
import { FriendListRow } from '../components/FriendListRow';
import { ErrorText, Field, PrimaryButton } from '../components/ui';
import { isNightTime } from '../petWorld/timeOfDay';
import { friendsPalette } from '../friendsTheme';
import { colors, fonts, layout } from '../theme';

interface Props {
  currentUserId: string;
  onClose: () => void;
  onOpenFriendPet: (friendUserId: string, friendUserIds: string[]) => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;
/** Waits for a pause in typing before hitting the search RPC. */
const SEARCH_DEBOUNCE_MS = 350;

const nameFor = (profile: FriendProfileSummary | undefined, fallbackId: string): string =>
  profile?.displayName || (profile?.username ? `@${profile.username}` : fallbackId);

export function FriendsScreen({ currentUserId, onClose, onOpenFriendPet }: Props) {
  const palette = friendsPalette(isNightTime());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendOverview[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfileSummary>>({});

  // 'loading' while the initial fetch is in flight, `null` once loaded with no
  // username set (gates the add panel only), or the username itself.
  const [username, setUsername] = useState<string | 'loading' | null>('loading');
  const [usernameInput, setUsernameInput] = useState('');
  const [settingUsername, setSettingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // The add-a-friend panel folds into this screen behind the top-right `+`,
  // rather than being a separate route -- the product owner wants requests and
  // adding to live on the one friends page.
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FriendProfileSummary[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [loadedFriends, loadedRequests, myUsername] = await Promise.all([
        friendsService.loadFriendsOverview(),
        friendsService.loadMyFriendRequests(),
        friendsService.getMyUsername(),
      ]);
      setFriends(loadedFriends);
      setRequests(loadedRequests);
      setUsername(myUsername);

      // Only incoming/outgoing need a separate profile fetch now -- accepted
      // friends carry their profile in the overview row.
      const { incoming, outgoing } = partitionFriendRequests(loadedRequests, currentUserId);
      const otherIds = [
        ...new Set([...incoming, ...outgoing].map((request) => otherPartyId(request, currentUserId))),
      ];
      const fetched = await Promise.all(otherIds.map((id) => friendsService.loadFriendProfile(id)));
      const nextProfiles: Record<string, FriendProfileSummary> = {};
      otherIds.forEach((id, index) => {
        const profile = fetched[index];
        if (profile) nextProfiles[id] = profile;
      });
      setProfiles(nextProfiles);
    } catch (cause) {
      setLoadError(errorMessage(cause, 'Could not load your friends.'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Debounced search -- fires after the user pauses, never on every keystroke.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      friendsService
        .searchUsersByUsername(trimmed)
        .then((results) => {
          setSearchResults(results.filter((result) => result.id !== currentUserId));
          setSearchError(null);
        })
        .catch((cause) => setSearchError(errorMessage(cause, 'Could not search for that username.')))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, currentUserId]);

  const saveUsername = async () => {
    setSettingUsername(true);
    setUsernameError(null);
    try {
      await friendsService.setMyUsername(usernameInput);
      setUsername(usernameInput.trim().toLowerCase());
      setUsernameInput('');
    } catch (cause) {
      setUsernameError(errorMessage(cause, 'Could not save your username.'));
    } finally {
      setSettingUsername(false);
    }
  };

  const runAction = async (id: string, action: () => Promise<void>) => {
    setPendingActionId(id);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setActionError(errorMessage(cause, 'That did not go through.'));
    } finally {
      setPendingActionId(null);
    }
  };

  const { incoming, outgoing } = partitionFriendRequests(requests, currentUserId);
  // Newest friendship first: it matches the "recent" feel of the Snapchat
  // reference, and needs no locale-aware name compare to stay stable.
  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => Date.parse(b.friendsSince) - Date.parse(a.friendsSince)),
    [friends],
  );
  const acceptedIds = sortedFriends.map((friend) => friend.friendId);
  const hasUsername = typeof username === 'string';

  return (
    <View style={[layout.screen, { backgroundColor: palette.screenBg }]}>
      <View style={[styles.topbar, { borderBottomColor: palette.divider }]}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={[styles.backLabel, { color: palette.secondaryText }]}>Pet</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.primaryText }]}>Friends</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a friend"
          onPress={() => setShowAdd((open) => !open)}
          hitSlop={8}
          style={styles.addButton}
        >
          <Text style={styles.addMark}>{showAdd ? '×' : '+'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={[layout.screen, styles.center, { backgroundColor: palette.screenBg }]}>
          <ActivityIndicator color={colors.coral} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}
          keyboardShouldPersistTaps="handled"
        >
          {loadError ? (
            <View style={[styles.card, { backgroundColor: palette.rowBg, borderColor: palette.divider }]}>
              <ErrorText>{loadError}</ErrorText>
              <Pressable accessibilityRole="button" onPress={() => void refresh()} hitSlop={8}>
                <Text style={styles.link}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {showAdd ? (
                <View style={[styles.card, { backgroundColor: palette.rowBg, borderColor: palette.divider }]}>
                  <Text style={[styles.cardTitle, { color: palette.primaryText }]}>Add a friend</Text>
                  {!hasUsername ? (
                    <View style={styles.gate}>
                      <Text style={[styles.gateText, { color: palette.secondaryText }]}>
                        Choose a username so friends can find you. Nothing else about your profile is shown.
                      </Text>
                      <Field label="Username">
                        <TextInput
                          style={layout.input}
                          value={usernameInput}
                          onChangeText={setUsernameInput}
                          placeholder="lowercase_letters_digits"
                          placeholderTextColor={colors.faint}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </Field>
                      <ErrorText>{usernameError}</ErrorText>
                      <PrimaryButton
                        label={settingUsername ? 'Saving...' : 'Save username'}
                        busy={settingUsername}
                        disabled={usernameInput.trim().length === 0}
                        onPress={() => void saveUsername()}
                      />
                    </View>
                  ) : (
                    <>
                      <TextInput
                        style={layout.input}
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search a username"
                        placeholderTextColor={colors.faint}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {searching ? (
                        <View style={styles.searchStatus}>
                          <ActivityIndicator color={colors.coral} size="small" />
                        </View>
                      ) : null}
                      {searchError ? <ErrorText>{searchError}</ErrorText> : null}
                      {!searching && searchResults && searchResults.length === 0 && !searchError ? (
                        <Text style={[styles.empty, { color: palette.secondaryText }]}>
                          No one found with that username.
                        </Text>
                      ) : null}
                      {searchResults?.map((result) => {
                        const relation = relationToUser(requests, currentUserId, result.id);
                        return (
                          <View key={result.id} style={[styles.searchRow, { borderBottomColor: palette.divider }]}>
                            <Text style={[styles.searchName, { color: palette.primaryText }]}>
                              {nameFor(result, result.id)}
                            </Text>
                            {relation === 'none' ? (
                              <Pressable
                                accessibilityRole="button"
                                disabled={pendingActionId === result.id}
                                onPress={() =>
                                  void runAction(result.id, async () => {
                                    await friendsService.sendFriendRequest(result.id);
                                  })
                                }
                                hitSlop={8}
                              >
                                <Text style={styles.link}>Add</Text>
                              </Pressable>
                            ) : (
                              <Text style={[styles.searchStatusText, { color: palette.secondaryText }]}>
                                {relation === 'friends'
                                  ? 'Friends'
                                  : relation === 'outgoing'
                                    ? 'Requested'
                                    : 'Wants to be friends'}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </>
                  )}
                </View>
              ) : null}

              {incoming.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: palette.secondaryText }]}>Requests</Text>
                  {incoming.map((request) => {
                    const otherId = otherPartyId(request, currentUserId);
                    const name = nameFor(profiles[otherId], otherId);
                    return (
                      <View
                        key={request.id}
                        style={[styles.banner, { backgroundColor: palette.bannerBg }]}
                      >
                        <Text style={[styles.bannerText, { color: palette.bannerText }]} numberOfLines={2}>
                          {name} wants to be friends
                        </Text>
                        <View style={styles.bannerActions}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={pendingActionId === request.id}
                            onPress={() =>
                              void runAction(request.id, () => friendsService.acceptFriendRequest(request.id))
                            }
                            hitSlop={8}
                          >
                            <Text style={[styles.link, styles.accept]}>Accept</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            disabled={pendingActionId === request.id}
                            onPress={() =>
                              void runAction(request.id, () => friendsService.declineFriendRequest(request.id))
                            }
                            hitSlop={8}
                          >
                            <Text style={[styles.link, styles.decline]}>Decline</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <ErrorText>{actionError}</ErrorText>

              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.secondaryText }]}>Your friends</Text>
                {sortedFriends.length === 0 ? (
                  <Text style={[styles.empty, { color: palette.secondaryText }]}>
                    No friends yet -- tap + to add one by username.
                  </Text>
                ) : (
                  sortedFriends.map((friend) => (
                    <FriendListRow
                      key={friend.friendId}
                      friend={friend}
                      palette={palette}
                      onPress={() => onOpenFriendPet(friend.friendId, acceptedIds)}
                    />
                  ))
                )}
              </View>

              {outgoing.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: palette.secondaryText }]}>Pending</Text>
                  {outgoing.map((request) => {
                    const otherId = otherPartyId(request, currentUserId);
                    return (
                      <View
                        key={request.id}
                        style={[styles.pendingRow, { borderColor: palette.divider }]}
                      >
                        <Text style={[styles.pendingName, { color: palette.secondaryText }]} numberOfLines={1}>
                          {nameFor(profiles[otherId], otherId)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          disabled={pendingActionId === request.id}
                          onPress={() =>
                            void runAction(request.id, () => friendsService.cancelOrUnfriend(request.id))
                          }
                          hitSlop={8}
                        >
                          <Text style={styles.link}>Cancel</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
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
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12 },
  topTitle: { fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.4 },
  addButton: { minWidth: 64, alignItems: 'flex-end' },
  addMark: { fontSize: 26, color: colors.coral, lineHeight: 26 },
  body: { padding: 16, gap: 18 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  cardTitle: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  gate: { gap: 4 },
  gateText: { fontSize: 13, lineHeight: 19 },
  section: { gap: 8 },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  empty: { fontSize: 13, paddingVertical: 6 },
  banner: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  bannerText: { fontSize: 14, fontWeight: '600' },
  bannerActions: { flexDirection: 'row', gap: 20 },
  link: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.5, color: colors.coral },
  accept: { color: colors.mintDeep },
  decline: { color: colors.coral },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 10,
  },
  pendingName: { fontSize: 13, flexShrink: 1 },
  searchStatus: { paddingVertical: 10 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  searchName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  searchStatusText: { fontFamily: fonts.mono, fontSize: 11 },
});
