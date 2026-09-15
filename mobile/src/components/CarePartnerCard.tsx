import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type PetInvite,
  type PetMember,
  activeMembers,
  formatInviteCode,
  isInviteOpen,
  isSharedPet,
  memberDisplayName,
  memberRole,
  normalizeInviteCode,
} from '@vitto/core';
import { FRIENDS_LIGHT, type FriendsPalette } from '../friendsTheme';
import { colors, fonts, layout, text } from '../theme';
import { PrimaryButton, TextButton } from './ui';

/**
 * Care partners: two accounts raising one pet. Every action rejects with a
 * readable message, shown inline under the control that raised it. The card
 * used to sit on Profile; it now lives on the Friends screen, which is where
 * the other people in the pet's life are.
 */
export interface CarePartnerProps {
  petName: string;
  selfUserId: string;
  /**
   * Which slot the pet on screen is in. Your own pet is the one you invite a
   * partner TO and can never leave; the joint pet is the one you were invited
   * to and CAN leave. The card is a different card for each.
   */
  isOwnPet: boolean;
  /** The joint slot is free, so a code can be entered from either pet's card. */
  canJoin: boolean;
  members: PetMember[];
  invite: PetInvite | null;
  busy: boolean;
  onCreateInvite: () => Promise<void>;
  onRevokeInvite: () => Promise<void>;
  /** Resolves true once joined, false when the user backed out of the confirm; rejects on failure. */
  onRedeemInvite: (code: string) => Promise<boolean>;
  onLeave: () => Promise<void>;
}

interface Props {
  carePartner: CarePartnerProps;
  /** Land with the "Join a partner's pet" code field already open. */
  openJoin?: boolean;
  /** The host screen's day/night colours; defaults to the paper palette. */
  palette?: FriendsPalette;
}

/** Six characters plus the hyphen `formatInviteCode` shows, so a pasted formatted code fits. */
const INVITE_INPUT_MAX_LENGTH = 7;

const ROLE_LABEL: Record<PetMember['role'], string> = { owner: 'Owner', partner: 'Partner' };

/**
 * The card reads top to bottom as: what this is, who is in it, what you can do
 * next. The two seats are always drawn — the empty one is the invitation to
 * fill it — and the two ways in (send a code, enter a code) are two labelled
 * options with a line each saying what happens, rather than a button and a
 * stray link.
 */
export function CarePartnerCard({ carePartner, openJoin, palette = FRIENDS_LIGHT }: Props) {
  // The invite-code entry, revealed on demand; raw text, normalised on submit.
  const [showJoin, setShowJoin] = useState(openJoin === true);
  const [joinCode, setJoinCode] = useState('');
  const [partnerError, setPartnerError] = useState<string | null>(null);

  /** Runs one partner action, keeping its failure next to the card rather than in the global banner. */
  const runPartnerAction = async (action: () => Promise<void>, fallback: string) => {
    setPartnerError(null);
    try {
      await action();
    } catch (cause) {
      setPartnerError(cause instanceof Error && cause.message ? cause.message : fallback);
    }
  };

  const joinWithCode = () =>
    runPartnerAction(async () => {
      const code = normalizeInviteCode(joinCode);
      if (code.length !== 6) throw new Error('Enter the six-character code your partner shared.');
      // A cancelled confirm keeps the code where it was typed.
      if (await carePartner.onRedeemInvite(code)) setJoinCode('');
    }, 'Could not join that pet.');

  const { petName } = carePartner;
  const shared = isSharedPet(carePartner.members);
  const isOwner = memberRole(carePartner.members, carePartner.selfUserId) === 'owner';
  const openInvite =
    carePartner.invite && isInviteOpen(carePartner.invite, new Date()) ? carePartner.invite : null;
  const members = activeMembers(carePartner.members);
  const primary = { color: palette.primaryText };
  const secondary = { color: palette.secondaryText };
  const edge = { borderColor: palette.divider };

  const lead = !carePartner.isOwnPet
    ? `You help raise ${petName}. It is your second pet; the owner keeps it if you leave.`
    : shared
      ? `You and your partner both look after ${petName}.`
      : openInvite
        ? `Your partner enters this code on their phone and ${petName} becomes a pet you raise together.`
        : `One other person can help you raise ${petName}.`;

  return (
    <View style={[styles.card, { backgroundColor: palette.rowBg }, edge]}>
      <Text style={[styles.title, secondary]}>{carePartner.isOwnPet ? 'Care partner' : 'Joint pet'}</Text>
      <Text style={[styles.lead, primary]}>{lead}</Text>

      {/* Who is in it. Both seats are always drawn for your own pet, so the
          empty one says plainly what the buttons below are for. */}
      <View style={[styles.seats, edge]}>
        {members.map((member) => (
          <View key={member.userId} style={styles.seat}>
            <View style={[styles.seatDot, member.role === 'owner' ? styles.seatDotOwner : styles.seatDotPartner]} />
            <Text style={[styles.seatName, primary]}>
              {member.userId === carePartner.selfUserId ? 'You' : memberDisplayName(carePartner.members, member.userId)}
            </Text>
            <Text style={[styles.seatRole, secondary]}>{ROLE_LABEL[member.role]}</Text>
          </View>
        ))}
        {carePartner.isOwnPet && !shared ? (
          <View style={styles.seat}>
            <View style={[styles.seatDot, styles.seatDotEmpty, edge]} />
            <Text style={[styles.seatName, styles.seatNameEmpty, secondary]}>
              {openInvite ? 'Waiting for your partner' : 'Nobody yet'}
            </Text>
            <Text style={[styles.seatRole, secondary]}>Partner</Text>
          </View>
        ) : null}
      </View>

      {!carePartner.isOwnPet ? (
        <View style={styles.footer}>
          <TextButton
            label={`Leave ${petName}`}
            tone="coral"
            onPress={() => void runPartnerAction(carePartner.onLeave, 'Could not leave this pet.')}
            disabled={carePartner.busy}
          />
        </View>
      ) : (
        <>
          {isOwner && !shared ? (
            openInvite ? (
              <View style={styles.codeBlock}>
                <Text style={[styles.optionLabel, secondary]}>Share this code</Text>
                <View style={[styles.codeBox, edge]}>
                  <Text style={[styles.code, primary]} selectable>
                    {formatInviteCode(openInvite.code)}
                  </Text>
                </View>
                <Text style={[styles.optionNote, secondary]}>
                  Works once · expires{' '}
                  {new Date(openInvite.expiresAt).toLocaleDateString([], { day: 'numeric', month: 'long' })}
                </Text>
                <View style={styles.footer}>
                  <TextButton
                    label="New code"
                    onPress={() => void runPartnerAction(carePartner.onCreateInvite, 'Could not create a code.')}
                    disabled={carePartner.busy}
                  />
                  <TextButton
                    label="Cancel code"
                    tone="coral"
                    onPress={() => void runPartnerAction(carePartner.onRevokeInvite, 'Could not cancel the code.')}
                    disabled={carePartner.busy}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.option}>
                <PrimaryButton
                  label="Invite a care partner"
                  busy={carePartner.busy}
                  onPress={() => void runPartnerAction(carePartner.onCreateInvite, 'Could not create a code.')}
                />
                <Text style={[styles.optionNote, secondary]}>You get a code to send them. They enter it on their phone.</Text>
              </View>
            )
          ) : null}

          {/* Joining adds a second pet; it never touches this one. Hidden once
              the joint slot is taken -- the way to free it is on the joint
              pet's own card. */}
          {!carePartner.canJoin ? null : showJoin ? (
            <View style={[styles.option, styles.joinPanel, edge]}>
              <Text style={[styles.optionLabel, secondary]}>Enter your partner's code</Text>
              <TextInput
                style={[layout.input, styles.codeInput]}
                value={joinCode}
                onChangeText={(value) => {
                  setJoinCode(value);
                  setPartnerError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                maxLength={INVITE_INPUT_MAX_LENGTH}
                placeholder="ABC-DEF"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Invite code"
              />
              <Text style={[styles.optionNote, secondary]}>Their pet becomes your second pet. Yours is not affected.</Text>
              <View style={styles.footer}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Join"
                    busy={carePartner.busy}
                    disabled={normalizeInviteCode(joinCode).length !== 6}
                    onPress={() => void joinWithCode()}
                  />
                </View>
                <TextButton label="Cancel" onPress={() => setShowJoin(false)} disabled={carePartner.busy} />
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowJoin(true)}
              style={({ pressed }) => [styles.option, styles.secondaryOption, edge, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.secondaryLabel, primary]}>I have a code</Text>
                <Text style={[styles.optionNote, secondary]}>Join someone else's pet as your second pet.</Text>
              </View>
              <Text style={styles.chevron}>→</Text>
            </Pressable>
          )}
        </>
      )}

      {carePartner.isOwnPet ? (
        <Text style={[styles.privacy, secondary]}>
          A partner sees when you care for {petName}, never what you ate or did.
        </Text>
      ) : null}

      {partnerError ? <Text style={styles.error}>{partnerError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 18 },
  title: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 8 },

  seats: { marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  seatDot: { width: 10, height: 10, borderRadius: 5 },
  seatDotOwner: { backgroundColor: colors.coral },
  seatDotPartner: { backgroundColor: colors.mintDeep },
  seatDotEmpty: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed' },
  seatName: { flex: 1, fontSize: 14, fontWeight: '600' },
  seatNameEmpty: { fontWeight: '400', fontStyle: 'italic' },
  seatRole: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },

  option: { marginTop: 14, gap: 8 },
  optionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  optionNote: { fontSize: 12, lineHeight: 17 },
  secondaryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondaryLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  chevron: { fontSize: 18, color: colors.coral },
  pressed: { opacity: 0.7 },

  joinPanel: { borderWidth: 1, borderRadius: 14, padding: 14 },
  codeInput: { fontFamily: fonts.mono, fontSize: 20, letterSpacing: 4, textAlign: 'center' },

  codeBlock: { marginTop: 14, gap: 8 },
  codeBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  code: { fontFamily: fonts.mono, fontSize: 30, letterSpacing: 5 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 },
  privacy: { fontSize: 11, lineHeight: 16, marginTop: 16 },
  error: { ...text.error, fontSize: 12, marginTop: 12 },
});
