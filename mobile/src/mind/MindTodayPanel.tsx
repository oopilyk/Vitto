import { Text, View } from 'react-native';
import type { PetState } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { surface } from '../components/surfaceStyle';
import { fonts, world, themedStyles } from '../theme';

/**
 * A lightweight "how has Mind gone today" strip for the hub's top, not a
 * dashboard. Three figures at most, the pet sat beside them so the hub reads
 * as a room the pet is waiting in rather than a menu. `today` is handed in
 * already computed by the caller — this panel never recomputes it.
 */

export interface MindTodayPanelProps {
  pet: PetState;
  /** Today's mind figures, already derived — never recompute them. */
  today: { sessionCount: number; xp: number; points: number };
  night: boolean;
}

/** Small enough to sit beside three figures in one strip, big enough to read as the pet, not a badge. */
const PET_SIZE = 84;

const isZeroDay = (today: MindTodayPanelProps['today']): boolean =>
  today.sessionCount === 0 && today.xp === 0 && today.points === 0;

interface FigureProps {
  value: number;
  label: string;
  night: boolean;
}

function Figure({ value, label, night }: FigureProps) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, night && styles.figureValueNight]}>{value}</Text>
      <Text style={[surface.kicker, night && surface.kickerNight]}>{label}</Text>
    </View>
  );
}

export function MindTodayPanel({ pet, today, night }: MindTodayPanelProps) {
  const zero = isZeroDay(today);
  return (
    <View style={[styles.panel, surface.panel, night && surface.panelNight]}>
      {/* The stage is 320 tall and sage by default, which stretched the
          panel to 355 pt with the pet in a narrow strip: a square of its own. */}
      <PetAvatar pet={pet} {...IDLE_ACTIVITY} size={PET_SIZE} hideStatusCaption stageStyle={styles.petStage} />
      <View style={styles.body}>
        <Text style={[surface.kicker, night && surface.kickerNight]}>MIND TODAY</Text>
        {zero ? (
          <Text style={[surface.caption, night && surface.captionNight, styles.zeroLine]} numberOfLines={2}>
            No games yet today. {pet.name} is ready whenever you are.
          </Text>
        ) : (
          <View style={styles.figures}>
            <Figure value={today.xp} label="XP" night={night} />
            <Figure value={today.points} label="POINTS" night={night} />
            <Figure value={today.sessionCount} label="PLAYED" night={night} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  petStage: { width: PET_SIZE, height: PET_SIZE, backgroundColor: 'transparent', overflow: 'visible' },
  body: { flex: 1, minHeight: 48, justifyContent: 'center' },
  zeroLine: { marginTop: 6, lineHeight: 15 },
  figures: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 20,
  },
  figure: { alignItems: 'flex-start' },
  figureValue: {
    fontFamily: fonts.ui,
    fontSize: 22,
    color: world.ink,
    marginBottom: 2,
  },
  figureValueNight: { color: world.nightText },
}));
