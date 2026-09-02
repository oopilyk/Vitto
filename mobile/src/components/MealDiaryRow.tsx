import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type HealthEvent, type MealMetadata, calorieEstimate } from '@vitto/core';
import { colors, fonts } from '../theme';

const LOGGED_VIA_ICON: Record<NonNullable<MealMetadata['loggedVia']>, string> = {
  ai: '✣',
  barcode: '▤',
  manual: '✎',
  healthkit: '♥',
};

const LOGGED_VIA_LABEL: Record<NonNullable<MealMetadata['loggedVia']>, string> = {
  ai: 'AI photo',
  barcode: 'Barcode',
  manual: 'Manual',
  healthkit: 'Apple Health',
};

export function MealDiaryRow({ event }: { event: HealthEvent<MealMetadata> }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = event.metadata.analysis;
  const loggedVia = event.metadata.loggedVia ?? 'ai';
  const name =
    analysis?.foodDescription || analysis?.detectedFoods.join(', ') || analysis?.summary || 'Meal';
  const calories = calorieEstimate(analysis?.macros);
  const time = new Date(event.occurredAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.summary}
      >
        <View style={styles.icon}>
          <Text style={styles.iconMark}>{LOGGED_VIA_ICON[loggedVia]}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={expanded ? undefined : 2}>
            {name}
          </Text>
          <Text style={styles.meta}>
            {time} · {LOGGED_VIA_LABEL[loggedVia]}
            {analysis ? ` · Grade ${analysis.grade}` : ''}
          </Text>
        </View>
        <Text style={styles.calories}>{calories} kcal</Text>
      </Pressable>

      {expanded && analysis ? (
        <View style={styles.detail}>
          <View style={styles.macroGrid}>
            {[
              [calories, 'Calories'],
              [`${analysis.macros.proteinGrams}g`, 'Protein'],
              [`${analysis.macros.carbsGrams}g`, 'Carbs'],
              [`${analysis.macros.fatGrams}g`, 'Fat'],
            ].map(([value, label]) => (
              <View key={String(label)} style={styles.macroCell}>
                <Text style={styles.macroValue}>{value}</Text>
                <Text style={styles.macroLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {loggedVia === 'ai' && analysis.summary ? (
            <Text style={styles.summaryText}>{analysis.summary}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, borderBottomColor: '#e5e2db' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMark: { color: colors.yellowDeep, fontSize: 15 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '500', color: colors.ink },
  meta: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  calories: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  detail: { paddingBottom: 16 },
  macroGrid: { flexDirection: 'row', gap: 10 },
  macroCell: {
    flex: 1,
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  macroValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  macroLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, marginTop: 3 },
  summaryText: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
});
