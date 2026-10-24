import { useCallback, useEffect, useRef, useState } from 'react';
import { SETTINGS_MAX_WIDTH } from '../components/settingsKit';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { companion as ai, describeReminderDays, errorMessage, formatReminderTime, type PetState, type Weekday } from '@vitto/core';
import { TextButton } from '../components/ui';
import { PetSpriteAvatar } from '../components/PetSpriteAvatar';
import { colors, fonts, layout, themedStyles } from '../theme';
import {
  CompanionLimitError,
  companionService,
  type CompanionAccess,
  type CompanionMessage,
  type CompanionProposal,
  type CompanionState,
  type LifeContext,
} from '../services/companionService';

interface Props {
  pet: PetState;
  /** Built fresh by the caller from the same data the dashboard draws. */
  life: LifeContext;
  onClose: () => void;
  /** Opens Vitto Plus from the daily-limit message. Absent for accounts that already have it. */
  onOpenPlus?: () => void;
  /**
   * Applies a change the pet proposed, through the app's own save. Rejects with
   * the reason when it cannot. Absent, no proposal is shown at all.
   */
  onApplyProposal?: (proposal: CompanionProposal) => Promise<void>;
}

/**
 * A change the pet offered, drawn under the reply it came with. `from` is the
 * value when it was offered, kept so the card still reads "2,300 → 2,000"
 * after the change has made today's target 2,000.
 */
interface ProposalCard {
  proposal: CompanionProposal;
  from: number | null;
  status: 'open' | 'applying' | 'applied' | 'cancelled';
  error?: string;
}

const SETTING_LABEL: Record<ai.ProposalSetting, string> = { calorieGoal: 'Daily calories', stepGoal: 'Daily steps' };

const proposalTitle = (card: ProposalCard): string => {
  const { proposal } = card;
  if (proposal.kind === 'reminder') return `Reminder: ${proposal.label}`;
  const to = proposal.value.toLocaleString('en-US');
  return `${SETTING_LABEL[proposal.setting]}: ${card.from !== null ? `${card.from.toLocaleString('en-US')} → ` : ''}${to}`;
};

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') void Haptics.notificationAsync(type).catch(() => {});
};

const LEVEL_LABEL: Record<ai.RelationshipLevel, string> = {
  STRANGER: 'Just met', ACQUAINTANCE: 'Getting to know you', FRIEND: 'Friends', CLOSE_FRIEND: 'Close friends', BONDED: 'Bonded',
};

/**
 * Talking to the pet.
 *
 * The pet here is the same individual every time: it remembers what it was told,
 * its personality has been drifting with how this person talks to it, and how
 * close the two of them are shows in the header. All of that is decided on the
 * server; this screen sends a message and draws what comes back.
 */
export function CompanionChatScreen({ pet, life, onClose, onOpenPlus, onApplyProposal }: Props) {
  const [state, setState] = useState<CompanionState | null>(null);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [access, setAccess] = useState<CompanionAccess | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed by the reply's id. Only in this screen's memory, never in the
  // conversation cache: a card is a one-time offer on the reply it came with.
  const [cards, setCards] = useState<Record<string, ProposalCard>>({});
  // Taps that have already decided a card, checked before state has caught up,
  // so a double tap cannot apply the same change twice.
  const decided = useRef(new Set<string>());
  const list = useRef<ScrollView>(null);
  // The keyboard takes the bottom of the screen, and the newest messages are
  // at the bottom of the thread: keep them in view as it opens (and as the
  // thread's window shrinks to make room), rather than hidden behind it.
  // Scrolled again once it is fully open: on "will show" the thread has not
  // shrunk yet, so that scroll went to the old bottom and the newest message
  // ended up behind the message box.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const toEnd = () => requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => {
        setKeyboardUp(true);
        toEnd();
      }),
      Keyboard.addListener('keyboardDidShow', toEnd),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  // Read through a ref so `load` does not re-run every time the day's numbers tick.
  const lifeRef = useRef(life);
  lifeRef.current = life;

  const load = useCallback(async (): Promise<CompanionMessage[] | null> => {
    try {
      const loaded = await companionService.load(pet.id, lifeRef.current);
      setState(loaded.state);
      setMessages(loaded.messages);
      setAccess(loaded.access);
      setError(null);
      return loaded.messages;
    } catch (cause) {
      setError(errorMessage(cause, `Could not reach ${pet.name}.`));
      return null;
    }
  }, [pet.id, pet.name]);

  // The last conversation seen on this phone first, so the chat opens on it at
  // once; the server's answer replaces it. Never over messages already loaded.
  useEffect(() => {
    let live = true;
    void companionService.cached(pet.id).then((snapshot) => {
      if (!live || !snapshot) return;
      setMessages((current) => (current.length ? current : snapshot.messages));
      setState((current) => current ?? snapshot.state);
      setAccess((current) => current ?? snapshot.access);
    });
    void load();
    return () => {
      live = false;
    };
  }, [load, pet.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setDraft('');
    // Shown at once; replaced by the stored row when the reply lands.
    const pending: CompanionMessage = { id: `pending-${Date.now()}`, role: 'user', content: text, createdAt: Date.now(), source: 'reply', triggerKey: null };
    setMessages((current) => [...current, pending]);
    try {
      const result = await companionService.send(pet.id, lifeRef.current, text);
      setMessages((current) => [...current.filter((m) => m.id !== pending.id), result.userMessage, result.reply]);
      const proposal = result.proposal;
      if (proposal && onApplyProposal) {
        const today = lifeRef.current.today;
        const from = proposal.kind === 'setting' ? (proposal.setting === 'calorieGoal' ? today.calorieTarget : today.stepGoal) : null;
        setCards((current) => ({ ...current, [result.reply.id]: { proposal, from, status: 'open' } }));
      }
      setState(result.state);
      setAccess(result.access);
    } catch (cause) {
      setMessages((current) => current.filter((m) => m.id !== pending.id));
      if (cause instanceof CompanionLimitError) {
        setDraft(text);
        setAccess(cause.access);
      } else {
        const reason = errorMessage(cause, 'That did not send. Try again.');
        // The server stores the message before it asks the model, so a failure
        // can mean "never arrived" or "arrived, but the reply was lost". Resync
        // and look: the draft comes back only if the message truly is not there,
        // so nothing typed is lost and nothing is ever sent twice.
        const synced = await load();
        const arrived = synced?.slice(-4).some((m) => m.role === 'user' && m.content === text) ?? false;
        if (!arrived) setDraft(text);
        setError(reason);
      }
    } finally {
      setSending(false);
    }
  };

  const decide = async (id: string, apply: boolean) => {
    const card = cards[id];
    if (!card || !onApplyProposal || decided.current.has(id)) return;
    decided.current.add(id);
    if (!apply) {
      setCards((current) => ({ ...current, [id]: { ...card, status: 'cancelled', error: undefined } }));
      return;
    }
    setCards((current) => ({ ...current, [id]: { ...card, status: 'applying', error: undefined } }));
    try {
      await onApplyProposal(card.proposal);
      setCards((current) => ({ ...current, [id]: { ...card, status: 'applied', error: undefined } }));
      buzz(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      // Nothing changed, so it can be tried again.
      decided.current.delete(id);
      setCards((current) => ({ ...current, [id]: { ...card, status: 'open', error: errorMessage(cause, 'That did not save. Try again.') } }));
      buzz(Haptics.NotificationFeedbackType.Error);
    }
  };

  const limitReached = access !== null && !access.canChat;
  const limits = ai.limitsFor(access?.tier);

  return (
    <KeyboardAvoidingView style={[layout.screen, styles.screen]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <PetSpriteAvatar pet={pet} size={40} backgroundColor={colors.card} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{pet.name}</Text>
          {state ? (
            <View style={styles.bondRow}>
              <Text style={styles.level}>{LEVEL_LABEL[state.relationshipLevel]}</Text>
              <View style={styles.bondTrack} accessibilityLabel={`Progress to the next level: ${Math.round(ai.levelProgress(state.relationshipScore) * 100)} percent`}>
                <View style={[styles.bondFill, { width: `${Math.round(ai.levelProgress(state.relationshipScore) * 100)}%` }]} />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/*
        A plain ScrollView on purpose. The thread is capped at fifty messages, and
        a virtualized list renders new rows in scroll-driven batches: a message
        sent into a long thread sat as blank spacer until the next batch, so the
        person's own words were missing from the screen while the pet "thought".
      */}
      <ScrollView
        ref={list}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        onLayout={() => list.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
      >
        {messages.length === 0 ? (
          state ? (
            <Text style={styles.empty}>{`Say hi. ${pet.name} remembers what you tell it.`}</Text>
          ) : error ? null : (
            <ActivityIndicator color={colors.coral} style={{ marginTop: 40 }} />
          )
        ) : null}
        {messages.map((item) => {
          const card = cards[item.id];
          return (
            <View key={item.id} style={styles.turn}>
              <View style={[styles.bubble, item.role === 'user' ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, item.role === 'user' && styles.mineText]}>{item.content}</Text>
              </View>
              {card ? <ProposalCardView card={card} onDecide={(apply) => void decide(item.id, apply)} /> : null}
            </View>
          );
        })}
        {sending ? <Text style={styles.typing}>{`${pet.name} is thinking…`}</Text> : null}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {limitReached ? (
        // The paywall seam, as the person meets it.
        <View style={styles.limit}>
          <Text style={styles.limitTitle}>{`${pet.name} is all talked out for today.`}</Text>
          <Text style={styles.limitBody}>{`You get ${limits.messagesPerDay} messages a day. It resets on its own — come back later.`}</Text>
          {onOpenPlus ? (
            <TextButton label="Chat more with Plus" tone="coral" onPress={onOpenPlus} />
          ) : null}
        </View>
      ) : (
        <>
        {/* Above the box, not under it: under it, it sat between the box and the keyboard. */}
        {access && access.messagesLeftToday <= 5 ? (
          <Text style={styles.remaining}>{`${access.messagesLeftToday} message${access.messagesLeftToday === 1 ? '' : 's'} left today`}</Text>
        ) : null}
        {/* The home-bar space only when the keyboard is down: up, the box sits right on it. */}
        <View style={[styles.composer, keyboardUp && styles.composerKeyboardUp]}>
          <TextInput
            style={[layout.input, styles.input]}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${pet.name}`}
            placeholderTextColor={colors.faint}
            maxLength={limits.maxMessageLength}
            multiline
            // Return sends, and closes the keyboard, rather than starting a new
            // line: a chat message is one thought, and the box still wraps it.
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void send()}
            editable={!sending}
            accessibilityLabel={`Message ${pet.name}`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: sending || !draft.trim() }}
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
            style={({ pressed }) => [styles.send, (sending || !draft.trim()) && styles.sendOff, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.sendMark}>↑</Text>
          </Pressable>
        </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function ProposalCardView({ card, onDecide }: { card: ProposalCard; onDecide: (apply: boolean) => void }) {
  const { proposal } = card;
  const title = proposalTitle(card);
  const adding = proposal.kind === 'reminder';
  return (
    <View style={styles.card} testID="companion-proposal">
      <Text style={styles.cardTitle}>{title}</Text>
      {proposal.kind === 'reminder' ? (
        <Text style={styles.cardDetail}>{`${formatReminderTime(proposal.hour, proposal.minute)} · ${describeReminderDays(proposal.days as Weekday[])}`}</Text>
      ) : null}
      {card.status === 'applied' || card.status === 'cancelled' ? (
        <Text style={styles.cardOutcome} accessibilityLiveRegion="polite">
          {card.status === 'cancelled' ? 'Cancelled' : adding ? 'Added' : 'Changed'}
        </Text>
      ) : (
        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Add reminder' : 'Change'}
            accessibilityState={{ disabled: card.status === 'applying' }}
            disabled={card.status === 'applying'}
            onPress={() => onDecide(true)}
            hitSlop={6}
            style={({ pressed }) => [styles.cardButton, styles.cardConfirm, pressed && { opacity: 0.8 }]}
          >
            {card.status === 'applying' ? (
              <ActivityIndicator color="#fffdf8" size="small" />
            ) : (
              <Text style={styles.cardConfirmText}>{adding ? 'Add' : 'Change'}</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={card.status === 'applying'}
            onPress={() => onDecide(false)}
            hitSlop={6}
            style={({ pressed }) => [styles.cardButton, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.cardCancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}
      {card.error ? <Text style={styles.cardError}>{card.error}</Text> : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  screen: { backgroundColor: colors.paper },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 58, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { paddingRight: 4 },
  backArrow: { fontFamily: fonts.pixel, fontSize: 26, color: colors.coral },
  name: { fontFamily: fonts.pixel, fontSize: 25, color: colors.ink },
  bondRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  level: { fontFamily: fonts.pixel, fontSize: 13, letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  bondTrack: { flex: 1, maxWidth: 90, height: 4, borderRadius: 2, backgroundColor: colors.hairline, overflow: 'hidden' },
  bondFill: { height: 4, borderRadius: 2, backgroundColor: colors.coral },
  // A column, like Settings, so on a tablet the bubbles read as a thread
  // rather than lines running the width of the screen. No change on a phone.
  thread: { padding: 16, gap: 8, flexGrow: 1, width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  empty: { fontFamily: fonts.pixel, fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 40, lineHeight: 23 },
  turn: { gap: 6 },
  card: {
    alignSelf: 'flex-start', maxWidth: '82%', paddingVertical: 10, paddingHorizontal: 13, borderRadius: 4,
    borderWidth: 1, borderColor: colors.coral, backgroundColor: colors.card,
  },
  cardTitle: { fontFamily: fonts.pixel, fontSize: 18, lineHeight: 24, color: colors.ink },
  cardDetail: { fontFamily: fonts.pixel, fontSize: 15, color: colors.muted, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  cardButton: { minWidth: 76, minHeight: 34, paddingHorizontal: 12, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cardConfirm: { backgroundColor: colors.coral },
  cardConfirmText: { fontFamily: fonts.pixelBold, fontSize: 16, color: '#fffdf8' },
  cardCancelText: { fontFamily: fonts.pixel, fontSize: 16, color: colors.muted },
  cardOutcome: { fontFamily: fonts.pixel, fontSize: 15, color: colors.muted, marginTop: 6 },
  cardError: { fontFamily: fonts.pixel, fontSize: 14, color: colors.danger, marginTop: 6 },
  bubble: { maxWidth: '82%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderBottomLeftRadius: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.coral, borderBottomRightRadius: 4 },
  bubbleText: { fontFamily: fonts.pixel, fontSize: 20, lineHeight: 27, color: colors.ink },
  mineText: { color: '#fffdf8' },
  typing: { fontFamily: fonts.pixel, fontSize: 14, color: colors.faint, marginTop: 4 },
  error: { fontFamily: fonts.pixel, fontSize: 17, color: colors.danger, paddingHorizontal: 18, paddingBottom: 6 },
  composer: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 28 : 14 },
  input: { flex: 1, maxHeight: 120, paddingTop: 11 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral },
  sendOff: { backgroundColor: colors.hairline },
  sendMark: { fontFamily: fonts.pixelBold, fontSize: 26, color: '#fffdf8' },
  limit: { margin: 14, padding: 16, borderRadius: 4, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card },
  limitTitle: { fontFamily: fonts.pixel, fontSize: 22, color: colors.ink },
  limitBody: { fontFamily: fonts.pixel, fontSize: 17, lineHeight: 25, color: colors.inkSoft, marginTop: 6 },
  remaining: { fontFamily: fonts.pixel, fontSize: 13, color: colors.faint, textAlign: 'center', paddingTop: 6 },
  composerKeyboardUp: { paddingBottom: 8 },
}));
