import { Text, View } from 'react-native';
import { CARE_AREAS, toggleCareArea, tracksArea, type CareArea } from '@vitto/core';
import { SettingsPage, ToggleRow } from '../components/settingsKit';
import { colors, themedStyles } from '../theme';

interface Props {
  petName: string;
  /** What affects the pet now (the pet's own setting; absent means everything). */
  areas: readonly CareArea[] | undefined;
  onChange: (areas: CareArea[]) => void;
  /**
   * Only the pet's owner chooses. A partner on a shared pet sees the same rules,
   * read-only. Defaults to true (your own pet).
   */
  canEdit?: boolean;
  onClose: () => void;
}

/** Each area, in the person's terms: what it is, and what turning it off means for the pet. */
const AREA_COPY = (petName: string): Record<CareArea, { title: string; on: string; off: string }> => ({
  nutrition: {
    title: 'Food',
    on: `Meals keep ${petName} fed. Skip them and ${petName} gets hungry.`,
    off: `${petName} never gets hungry. Logging meals is optional.`,
  },
  training: {
    title: 'Workouts',
    on: `Workouts give ${petName} energy and build their strength.`,
    off: 'Workouts are optional.',
  },
  movement: {
    title: 'Steps',
    on: `Walking gives ${petName} energy.`,
    off: 'Steps are optional.',
  },
  mind: {
    title: 'Mind games',
    on: `Games keep ${petName} sharp. Skip them and ${petName} gets foggy.`,
    off: `${petName} never gets foggy. Games are optional.`,
  },
});

/**
 * What affects the pet, on its own page (from Settings). Someone not interested
 * in tracking food, say, turns Food off and the pet simply never gets hungry
 * (see careAreas in @vitto/core). One area always stays on.
 */
export function CareAreasScreen({ petName, areas, onChange, canEdit = true, onClose }: Props) {
  const copy = AREA_COPY(petName);
  const onCount = CARE_AREAS.filter((area) => tracksArea(areas, area)).length;
  const energyHeld = !tracksArea(areas, 'training') && !tracksArea(areas, 'movement');

  return (
    <SettingsPage
      title={`What affects ${petName}`}
      lead={
        canEdit
          ? `Choose what you want to track. Anything you turn off stops affecting ${petName}'s health, and you can change this any time.`
          : `What counts toward ${petName}'s health. Only ${petName}'s owner can change this.`
      }
      backLabel="Settings"
      onBack={onClose}
    >
      <View style={styles.body}>
        {CARE_AREAS.map((area) => {
          const on = tracksArea(areas, area);
          if (!canEdit) {
            return (
              <View key={area} style={styles.readRow} testID={`care-area-${area}`}>
                <View style={styles.readText}>
                  <Text style={styles.readTitle}>{copy[area].title}</Text>
                  <Text style={styles.readBody}>{on ? copy[area].on : copy[area].off}</Text>
                </View>
                <Text style={[styles.readState, on && styles.readStateOn]}>{on ? 'On' : 'Off'}</Text>
              </View>
            );
          }
          const last = on && onCount === 1;
          return (
            <ToggleRow
              key={area}
              title={copy[area].title}
              description={last ? `${copy[area].on} At least one has to stay on.` : on ? copy[area].on : copy[area].off}
              value={on}
              onChange={() => {
                if (!last) onChange(toggleCareArea(areas, area));
              }}
            />
          );
        })}
        {energyHeld ? (
          <Text style={styles.note}>{`With workouts and steps both off, ${petName} never gets tired either.`}</Text>
        ) : null}
        <Text style={styles.note}>{`Happiness always counts: anything you log makes ${petName} happier.`}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  body: { marginTop: 16, gap: 16 },
  note: { fontSize: 13, lineHeight: 19, color: colors.muted },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  readText: { flex: 1, gap: 2 },
  readTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  readBody: { fontSize: 13, lineHeight: 18, color: colors.muted },
  readState: { fontSize: 14, fontWeight: '600', color: colors.faint },
  readStateOn: { color: colors.ink },
}));
