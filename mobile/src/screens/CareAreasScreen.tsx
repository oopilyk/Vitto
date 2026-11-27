import { Text, View } from 'react-native';
import { CARE_AREAS, toggleCareArea, tracksArea, type CareArea } from '@vitto/core';
import { SettingsPage, ToggleRow } from '../components/settingsKit';
import { colors, themedStyles, fonts } from '../theme';
import { t } from '../i18n';

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
    title: t('Food'),
    on: t('Meals keep {pet} fed and give them energy. Skip them and {pet} gets hungry and sleepy.', { pet: petName }),
    off: t('{pet} never gets hungry or sleepy. Logging meals is optional.', { pet: petName }),
  },
  training: {
    title: t('Workouts'),
    on: t('Workouts give {pet} vitality and build their strength.', { pet: petName }),
    off: t('Workouts are optional.'),
  },
  movement: {
    title: t('Steps'),
    on: t('Walking gives {pet} vitality.', { pet: petName }),
    off: t('Steps are optional.'),
  },
  mind: {
    title: t('Mind games'),
    on: t('Games keep {pet} sharp. Skip them and {pet} gets foggy.', { pet: petName }),
    off: t('{pet} never gets foggy. Games are optional.', { pet: petName }),
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
      title={t('What affects {pet}', { pet: petName })}
      lead={
        canEdit
          ? t("Choose what you want to track. Anything you turn off stops affecting {pet}'s health, and you can change this any time.", { pet: petName })
          : t("What counts toward {pet}'s health. Only {pet}'s owner can change this.", { pet: petName })
      }
      backLabel={t('Settings')}
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
                <Text style={[styles.readState, on && styles.readStateOn]}>{on ? t('On') : t('Off')}</Text>
              </View>
            );
          }
          const last = on && onCount === 1;
          return (
            <ToggleRow
              key={area}
              title={copy[area].title}
              description={last ? t('{description} At least one has to stay on.', { description: copy[area].on }) : on ? copy[area].on : copy[area].off}
              value={on}
              onChange={() => {
                if (!last) onChange(toggleCareArea(areas, area));
              }}
            />
          );
        })}
        {energyHeld ? (
          <Text style={styles.note}>{t("With workouts and steps both off, {pet}'s vitality never runs down either.", { pet: petName })}</Text>
        ) : null}
        <Text style={styles.note}>{t('Happiness always counts: anything you log makes {pet} happier.', { pet: petName })}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  body: { marginTop: 16, gap: 16 },
  note: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  readText: { flex: 1, gap: 2 },
  readTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  readBody: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted },
  readState: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.faint },
  readStateOn: { color: colors.ink },
}));
