import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { companion as ai, errorMessage, type PetState } from '@vitto/core';
import { PetSpriteAvatar } from '../components/PetSpriteAvatar';
import { colors, fonts, layout } from '../theme';
import {
  CompanionLimitError,
  companionService,
  type CompanionAccess,
  type CompanionMessage,
  type CompanionState,
  type LifeContext,
} from '../services/companionService';

interface Props {
  pet: PetState;
  /** Built fresh by the caller from the same data the dashboard draws. */
  life: LifeContext;
  onClose: () => void;
}

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
export function CompanionChatScreen({ pet, life, onClose }: Props) {
  const [state, setState] = useState<CompanionState | null>(null);
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [access, setAccess] = useState<CompanionAccess | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<ScrollView>(null);
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

  useEffect(() => { void load(); }, [load]);

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
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          state ? (
            <Text style={styles.empty}>{`Say hi. ${pet.name} remembers what you tell it.`}</Text>
          ) : error ? null : (
            <ActivityIndicator color={colors.coral} style={{ marginTop: 40 }} />
          )
        ) : null}
        {messages.map((item) => (
          <View key={item.id} style={[styles.bubble, item.role === 'user' ? styles.mine : styles.theirs]}>
            <Text style={[styles.bubbleText, item.role === 'user' && styles.mineText]}>{item.content}</Text>
          </View>
        ))}
        {sending ? <Text style={styles.typing}>{`${pet.name} is thinking…`}</Text> : null}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {limitReached ? (
        // The paywall seam, as the person meets it. Free today; this is where an
        // upgrade prompt goes once there is something to upgrade to.
        <View style={styles.limit}>
          <Text style={styles.limitTitle}>{`${pet.name} is all talked out for today.`}</Text>
          <Text style={styles.limitBody}>{`You get ${limits.messagesPerDay} messages a day. It resets on its own — come back later.`}</Text>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            style={[layout.input, styles.input]}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${pet.name}`}
            placeholderTextColor={colors.faint}
            maxLength={limits.maxMessageLength}
            multiline
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
      )}
      {access && access.canChat && access.messagesLeftToday <= 5 ? (
        <Text style={styles.remaining}>{`${access.messagesLeftToday} message${access.messagesLeftToday === 1 ? '' : 's'} left today`}</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 58, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  back: { paddingRight: 4 },
  backArrow: { fontSize: 20, color: colors.coral },
  name: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  bondRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  level: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: colors.muted, textTransform: 'uppercase' },
  bondTrack: { flex: 1, maxWidth: 90, height: 4, borderRadius: 2, backgroundColor: colors.hairline, overflow: 'hidden' },
  bondFill: { height: 4, borderRadius: 2, backgroundColor: colors.coral },
  thread: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 40, lineHeight: 18 },
  bubble: { maxWidth: '82%', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline, borderBottomLeftRadius: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.coral, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.ink },
  mineText: { color: '#fffdf8' },
  typing: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 4 },
  error: { fontSize: 13, color: colors.danger, paddingHorizontal: 18, paddingBottom: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 28 : 14 },
  input: { flex: 1, maxHeight: 120, paddingTop: 11 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coral },
  sendOff: { backgroundColor: colors.hairline },
  sendMark: { fontSize: 20, fontWeight: '700', color: '#fffdf8' },
  limit: { margin: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card },
  limitTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  limitBody: { fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: 6 },
  remaining: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, textAlign: 'center', paddingBottom: 8 },
});
