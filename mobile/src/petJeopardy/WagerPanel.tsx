import { Pressable, Text, View } from 'react-native';
import { isValidJeopardyWager } from '@vitto/core';
import { PrimaryButton } from '../components/ui';
import { SURFACE_BORDER_WIDTH, SURFACE_RADIUS, surface, surfacePressed } from '../components/surfaceStyle';
import { fonts, world, themedStyles } from '../theme';
import { WAGER_STEP } from './board';
import { t } from '../i18n';

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
      <View style={[styles.panel, surface.panel, night && surface.panelNight]}>
        <Text style={[surface.kicker, night && surface.kickerNight]}>{t('Final Jeopardy')}</Text>
        <Text style={[styles.heading, night && styles.headingNight]}>{t('How much do you risk?')}</Text>
        {/* The ceiling IS what was earned this round, stated plainly: winning
            doubles it, losing gives it back. */}
        <Text style={[surface.caption, night && surface.captionNight, styles.line]}>
          {max > 0
            ? t("You earned {xp} XP this round. Risk any part of it — win, and you double it; lose, and it's gone.", { xp: max })
            : t("You didn't bank any XP this round — this one is a free shot.")}
        </Text>

        <View style={styles.stepper}>
          <StepButton
            label={`−${WAGER_STEP}`}
            hint={t('Lower the wager by {step} XP', { step: WAGER_STEP })}
            disabled={amount <= 0}
            night={night}
            onPress={() => onChange(clamp(amount - WAGER_STEP))}
          />
          <View style={styles.readout}>
            <Text
              style={[styles.amount, night && styles.amountNight]}
              accessibilityLabel={t('Wager: {amount} XP', { amount })}
            >
              {amount}
            </Text>
            <Text style={[surface.kicker, night && surface.kickerNight]}>XP</Text>
          </View>
          <StepButton
            label={`+${WAGER_STEP}`}
            hint={t('Raise the wager by {step} XP', { step: WAGER_STEP })}
            disabled={amount >= max}
            night={night}
            onPress={() => onChange(clamp(amount + WAGER_STEP))}
          />
        </View>

        <View style={styles.presets}>
          <Preset label={t('Nothing')} spoken={t('Wager nothing')} night={night} onPress={() => onChange(0)} />
          <Preset label={t('Half')} spoken={t('Wager half')} night={night} onPress={() => onChange(clamp(max / 2))} />
          <Preset label={t('Everything')} spoken={t('Wager everything')} night={night} onPress={() => onChange(max)} />
        </View>
      </View>

      <View style={styles.confirm}>
        <PrimaryButton label={t('Lock it in')} onPress={onConfirm} disabled={!canConfirm} busy={busy} />
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
        pressed && !disabled && surfacePressed,
      ]}
    >
      <Text style={[styles.stepLabel, night && styles.stepLabelNight]}>{label}</Text>
    </Pressable>
  );
}

function Preset({ label, spoken, night, onPress }: { label: string; spoken: string; night: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => [
        styles.preset,
        surface.panelQuiet,
        night && surface.panelQuietNight,
        pressed && surfacePressed,
      ]}
    >
      <Text style={[surface.kicker, night && surface.kickerNight]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  wrap: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  panel: { paddingVertical: 20, paddingHorizontal: 18, alignItems: 'center' },
  heading: { fontFamily: fonts.ui, fontSize: 28, color: world.ink, marginTop: 8, letterSpacing: 0 },
  headingNight: { color: world.nightText },
  line: { marginTop: 8, textAlign: 'center', lineHeight: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 },
  step: {
    width: 58,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: SURFACE_BORDER_WIDTH,
    borderRadius: SURFACE_RADIUS,
    backgroundColor: world.surfaceSoft,
  },
  stepNight: { backgroundColor: world.nightSurfaceSoft },
  stepOff: { opacity: 0.4 },
  stepLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: world.ink },
  stepLabelNight: { color: world.nightText },
  readout: { minWidth: 84, alignItems: 'center' },
  amount: { fontFamily: fonts.ui, fontSize: 41, color: world.ink, letterSpacing: 0 },
  amountNight: { color: world.nightText },
  presets: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  preset: { paddingVertical: 8, paddingHorizontal: 14 },
  confirm: { marginTop: 'auto', paddingBottom: 28 },
}));
