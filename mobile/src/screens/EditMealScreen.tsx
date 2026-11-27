import { useMemo, useState } from 'react';
import {
  type HealthEvent,
  type MealMetadata,
  type MealSlot,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  calorieEstimate,
  mealSlotOf,
} from '@vitto/core';
import {
  FieldRow,
  FormField,
  SaveBar,
  SegmentedControl,
  SettingsPage,
  SettingsSection,
  TextField,
} from '../components/settingsKit';
import { NumberInput } from '../components/ui';
import { formatLocale, t, tx } from '../i18n';
import { themedStyles } from '../theme';

interface Props {
  meal: HealthEvent<MealMetadata>;
  onSave: (metadata: Partial<MealMetadata>) => Promise<void>;
  onClose: () => void;
}

const nameOf = (meal: MealMetadata) =>
  meal.analysis?.foodDescription || meal.analysis?.detectedFoods.join(', ') || meal.analysis?.summary || t('Meal');

/**
 * Fixing a logged meal: what it was called, which meal of the day, and its
 * numbers. The meal keeps its place in the day, its grade and the XP it
 * earned; only what was wrong about it changes.
 */
export function EditMealScreen({ meal, onSave, onClose }: Props) {
  const original = meal.metadata;
  const macros = original.analysis?.macros;
  const [name, setName] = useState(nameOf(original));
  const [slot, setSlot] = useState<MealSlot>(mealSlotOf(meal));
  const [calories, setCalories] = useState<number | undefined>(macros ? calorieEstimate(macros) : undefined);
  const [protein, setProtein] = useState<number | undefined>(macros?.proteinGrams);
  const [carbs, setCarbs] = useState<number | undefined>(macros?.carbsGrams);
  const [fat, setFat] = useState<number | undefined>(macros?.fatGrams);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      name.trim() !== nameOf(original) ||
      slot !== mealSlotOf(meal) ||
      calories !== (macros ? calorieEstimate(macros) : undefined) ||
      protein !== macros?.proteinGrams ||
      carbs !== macros?.carbsGrams ||
      fat !== macros?.fatGrams,
    [name, slot, calories, protein, carbs, fat, original, meal, macros],
  );

  const save = async () => {
    if (!name.trim()) {
      setError(t('Give the meal a name.'));
      return;
    }
    if (calories !== undefined && (calories < 0 || calories > 10000)) {
      setError(t('Calories should be between 0 and 10,000.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const analysis = original.analysis;
      await onSave({
        slot,
        ...(analysis
          ? {
              analysis: {
                ...analysis,
                foodDescription: name.trim(),
                macros: {
                  ...analysis.macros,
                  calories: calories ?? 0,
                  proteinGrams: protein ?? 0,
                  carbsGrams: carbs ?? 0,
                  fatGrams: fat ?? 0,
                },
              },
            }
          : {}),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save the meal.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setName(nameOf(original));
    setSlot(mealSlotOf(meal));
    setCalories(macros ? calorieEstimate(macros) : undefined);
    setProtein(macros?.proteinGrams);
    setCarbs(macros?.carbsGrams);
    setFat(macros?.fatGrams);
  };

  return (
    <SettingsPage
      title={t('Edit meal')}
      lead={new Date(meal.occurredAt).toLocaleString(formatLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
      backLabel={tx('button that goes back to the previous screen', 'Back')}
      onBack={onClose}
      footer={dirty ? <SaveBar saving={saving} error={error} onSave={() => void save()} onDiscard={reset} /> : null}
    >
      <SettingsSection title={t('The meal')} first>
        <FormField label={t('Name')}>
          <TextField value={name} onChangeText={setName} maxLength={80} accessibilityLabel={t('Meal name')} />
        </FormField>
        <SegmentedControl
          options={MEAL_SLOTS.map((value) => ({ value, label: t(MEAL_SLOT_LABEL[value]) }))}
          value={slot}
          onChange={setSlot}
        />
      </SettingsSection>
      {macros ? (
        <SettingsSection title={t('Numbers')}>
          <FormField label={t('Calories')} hint="kcal">
            <NumberInput style={styles.input} value={calories} onValue={setCalories} accessibilityLabel={t('Calories')} />
          </FormField>
          <FieldRow>
            <FormField label={t('Protein')} hint="g">
              <NumberInput decimal style={styles.input} value={protein} onValue={setProtein} accessibilityLabel={t('Protein in grams')} />
            </FormField>
            <FormField label={t('Carbs')} hint="g">
              <NumberInput decimal style={styles.input} value={carbs} onValue={setCarbs} accessibilityLabel={t('Carbs in grams')} />
            </FormField>
            <FormField label={t('Fat')} hint="g">
              <NumberInput decimal style={styles.input} value={fat} onValue={setFat} accessibilityLabel={t('Fat in grams')} />
            </FormField>
          </FieldRow>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  // The same box as TextField's, for the number fields beside it.
  input: { minHeight: 44 },
}));
