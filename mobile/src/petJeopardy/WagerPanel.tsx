import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isValidJeopardyWager } from '@vitto/core';
import { PrimaryButton } from '../components/ui';
import { RETRO_BORDER_WIDTH, RETRO_RADIUS, retro, retroPressed } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { WAGER_STEP } from './board';

interface WagerPanelProps {
  /** `maxJeopardyWager(game)` — exactly what the board paid out this round. */
  max: number;
  amount: number;
  onChange: (amount: number) => void;
  onConfirm: () => void;
  night: boolean;
  busy: boolean;
}

/**
 * Setting the stake for the Final.
 *
 * A stepper and three presets rather than a slider: a slider would be a new
 * dependency for a value with eleven legal positions, and dragging a thumb to an
 * exact whole number on a phone is worse than tapping "+5" twice. Every control
 * here clamps into `[0, max]` before it calls back, so an out-of-range amount
 * never exists — and the confirm button still asks `isValidJeopardyWager`, the
 * same predicate the domain transition enforces, rather than a second copy of
 * the rule that could drift from it.
 */
export function WagerPanel({
  max,
  amount,
  onChange,
  onConfirm,
  night,
  busy,
}: WagerPanelProps) {
  const clamp = (next: number): number => Math.max(0, Math.min(max, Math.round(next)));
  const canConfirm = isValidJeopardyWager(amount, max) && !busy;

  return (
    <View style={styles.wrap}>
      <View style={[styles.panel, retro.panel, night && retro.panelNight]}>
        <Text style={[retro.kicker, night && retro.kickerNight]}>Final Jeopardy</Text>
        <Text style={[styles.heading, night && styles.headingNight]}>How much do you risk?</Text>
        {/* The ceiling IS what was earned this round, stated plainly: winning
            doubles it, losing gives it back. */}
        <Text style={[retro.caption, night && retro.captionNight, styles.line]}>
          {max > 0
            ? `You earned ${max} XP this round. Risk any part of it — win, and you double it; lose, and it's gone.`
            : "You didn't bank any XP this round — this one is a free shot."}
        </Text>

        <View style={styles.stepper}>
          <StepButton
            label={`−${WAGER_STEP}`}
            hint={`Lower the wager by ${WAGER_STEP} XP`}
            disabled={amount <= 0}
            night={night}
            onPress={() => onChange(clamp(amount - WAGER_STEP))}
          />
          <View style={styles.readout}>
            <Text
              style={[styles.amount, night && styles.amountNight]}
              accessibilityLabel={`Wager: ${amount} XP`}
            >
              {amount}
            </Text>
            <Text style={[retro.kicker, night && retro.kickerNight]}>XP</Text>
          </View>
          <StepButton
            label={`+${WAGER_STEP}`}
            hint={`Raise the wager by ${WAGER_STEP} XP`}
            disabled={amount >= max}
            night={night}
            onPress={() => onChange(clamp(amount + WAGER_STEP))}
          />
        </View>

        <View style={styles.presets}>
          <Preset label="Nothing" night={night} onPress={() => onChange(0)} />
          <Preset label="Half" night={night} onPress={() => onChange(clamp(max / 2))} />
          <Preset label="Everything" night={night} onPress={() => onChange(max)} />
        </View>
      </View>

      <View style={styles.confirm}>
        <PrimaryButton label="Lock it in" onPress={onConfirm} disabled={!canConfirm} busy={busy} />
      </View>
    </View>
  );
}

function StepButton({
  label,
  hint,
  disabled,
  night,
  onPress,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  night: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { borderColor: night ? world.nightInk : world.ink },
        night && styles.stepNight,
        disabled && styles.stepOff,
        pressed && !disabled && retroPressed,
      ]}
    >
      <Text style={[styles.stepLabel, night && styles.stepLabelNight]}>{label}</Text>
    </Pressable>
  );
}

function Preset({ label, night, onPress }: { label: string; night: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Wager ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.preset,
        retro.panelQuiet,
        night && retro.panelQuietNight,
        pressed && retroPressed,
      ]}
    >
      <Text style={[retro.kicker, night && retro.kickerNight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  panel: { paddingVertical: 20, paddingHorizontal: 18, alignItems: 'center' },
  heading: { fontFamily: fonts.display, fontSize: 24, color: world.ink, marginTop: 8, letterSpacing: -0.5 },
  headingNight: { color: world.nightText },
  line: { marginTop: 8, textAlign: 'center', lineHeight: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 },
  step: {
    width: 58,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: RETRO_BORDER_WIDTH,
    borderRadius: RETRO_RADIUS,
    backgroundColor: world.surfaceSoft,
  },
  stepNight: { backgroundColor: world.nightSurfaceSoft },
  stepOff: { opacity: 0.4 },
  stepLabel: { fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: world.ink },
  stepLabelNight: { color: world.nightText },
  readout: { minWidth: 84, alignItems: 'center' },
  amount: { fontFamily: fonts.display, fontSize: 40, color: world.ink, letterSpacing: -1 },
  amountNight: { color: world.nightText },
  presets: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  preset: { paddingVertical: 8, paddingHorizontal: 14 },
  confirm: { marginTop: 'auto', paddingBottom: 28 },
});
