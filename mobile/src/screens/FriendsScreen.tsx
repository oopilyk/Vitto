import { useCallback, useEffect, useRef, useState } from 'react';
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
  type FriendProfileSummary,
  type FriendRequest,
  errorMessage,
  otherPartyId,
  partitionFriendRequests,
  relationToUser,
} from '@vitto/core';
import { friendsService } from '../services/friendsService';
import { ErrorText, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  currentUserId: string;
  onClose: () => void;
  onOpenFriendPet: (friendUserId: string) => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;
/** Waits for a pause in typing before hitting the search RPC. */
const SEARCH_DEBOUNCE_MS = 350;

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Kicker>{title}</Kicker>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

const nameFor = (profile: FriendProfileSummary | undefined, fallbackId: string): string =>
  profile?.displayName || (profile?.username ? `@${profile.username}` : fallbackId);

export function FriendsScreen({ currentUserId, onClose, onOpenFriendPet }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfileSummary>>({});

  // 'loading' while the initial fetch is in flight, `null` once loaded with no
  // username set (gates search/add only -- see the onboarding note below), or the
  // username itself.
  const [username, setUsername] = useState<string | 'loading' | null>('loading');
  const [usernameInput, setUsernameInput] = useState('');
  const [settingUsername, setSettingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<FriendProfileSummary[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [loadedRequests, myUsername] = await Promise.all([
        friendsService.loadMyFriendRequests(),
        friendsService.getMyUsername(),
      ]);
      setRequests(loadedRequests);
      setUsername(myUsername);

      const { accepted, incoming, outgoing } = partitionFriendRequests(loadedRequests, currentUserId);
      const otherIds = [...new Set([...accepted, ...incoming, ...outgoing].map((request) => otherPartyId(request, currentUserId)))];
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

  // Debounced search -- fires MIN_SEARCH_LENGTH characters after the user pauses,
  // never on every keystroke.
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
      const saved = usernameInput.trim().toLowerCase();
      setUsername(saved);
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

  const { accepted, incoming, outgoing } = partitionFriendRequests(requests, currentUserId);
  const hasUsername = typeof username === 'string';

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Pet</Text>
        </Pressable>
        <Text style={styles.topTitle}>Friends</Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={[layout.screen, styles.center]}>
          <ActivityIndicator color={colors.coral} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}
          keyboardShouldPersistTaps="handled"
        >
          {loadError ? (
            <Card title="Friends">
              <ErrorText>{loadError}</ErrorText>
              <TextButton label="Try again" onPress={() => void refresh()} />
            </Card>
          ) : (
            <>
              <Card title="Your friends">
                {accepted.length === 0 ? (
                  <Text style={styles.empty}>No friends yet -- search a username below to add one.</Text>
                ) : (
                  accepted.map((request) => {
                    const otherId = otherPartyId(request, currentUserId);
                    const profile = profiles[otherId];
                    return (
                      <View key={request.id} style={styles.row}>
                        <Text style={styles.rowName}>{nameFor(profile, otherId)}</Text>
                        <View style={styles.rowActions}>
                          <TextButton label="View pet" onPress={() => onOpenFriendPet(otherId)} />
                          <TextButton
                            label="Unfriend"
                            tone="coral"
                            disabled={pendingActionId === request.id}
                            onPress={() =>
                              void runAction(request.id, () => friendsService.cancelOrUnfriend(request.id))
                            }
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>

              {incoming.length > 0 ? (
                <Card title="Requests for you">
                  {incoming.map((request) => {
                    const otherId = otherPartyId(request, currentUserId);
                    const profile = profiles[otherId];
                    return (
                      <View key={request.id} style={styles.row}>
                        <Text style={styles.rowName}>{nameFor(profile, otherId)}</Text>
                        <View style={styles.rowActions}>
                          <TextButton
                            label="Accept"
                            disabled={pendingActionId === request.id}
                            onPress={() =>
                              void runAction(request.id, () => friendsService.acceptFriendRequest(request.id))
                            }
                          />
                          <TextButton
                            label="Decline"
                            tone="coral"
                            disabled={pendingActionId === request.id}
                            onPress={() =>
                              void runAction(request.id, () => friendsService.declineFriendRequest(request.id))
                            }
                          />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              ) : null}

              {outgoing.length > 0 ? (
                <Card title="Sent requests">
                  {outgoing.map((request) => {
                    const otherId = otherPartyId(request, currentUserId);
                    const profile = profiles[otherId];
                    return (
                      <View key={request.id} style={styles.row}>
                        <Text style={styles.rowName}>{nameFor(profile, otherId)}</Text>
                        <TextButton
                          label="Cancel"
                          disabled={pendingActionId === request.id}
                          onPress={() =>
                            void runAction(request.id, () => friendsService.cancelOrUnfriend(request.id))
                          }
                        />
                      </View>
                    );
                  })}
                </Card>
              ) : null}

              <ErrorText>{actionError}</ErrorText>

              <Card title="Add a friend" hint="Search by their exact username">
                {!hasUsername ? (
                  <View style={styles.usernameGate}>
                    <Text style={styles.gateText}>
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
                      <Text style={styles.empty}>No one found with that username.</Text>
                    ) : null}
                    {searchResults?.map((result) => {
                      const relation = relationToUser(requests, currentUserId, result.id);
                      return (
                        <View key={result.id} style={styles.row}>
                          <Text style={styles.rowName}>{nameFor(result, result.id)}</Text>
                          {relation === 'none' ? (
                            <TextButton
                              label="Add"
                              disabled={pendingActionId === result.id}
                              onPress={() =>
                                void runAction(result.id, async () => {
                                  await friendsService.sendFriendRequest(result.id);
                                })
                              }
                            />
                          ) : (
                            <Text style={styles.rowStatus}>
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
              </Card>
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
    borderBottomColor: colors.hairline,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 16 },
  body: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
  },
  cardHint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  cardBody: { marginTop: 4 },
  empty: { fontSize: 13, color: colors.faint, paddingVertical: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee9e1',
    gap: 10,
  },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  rowActions: { flexDirection: 'row', gap: 16 },
  rowStatus: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  usernameGate: { gap: 4 },
  gateText: { ...text.body, fontSize: 13 },
  searchStatus: { paddingVertical: 10 },
});
