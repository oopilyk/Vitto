import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { PrimaryButton } from './ui';
import { colors, layout, themedStyles } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Far enough back for anyone; nobody is 120. */
const YEARS_BACK = 100;

interface Props {
  /** '1'-'12', or '' before one is chosen. */
  month: string;
  /** Four digits, or '' before one is chosen. */
  year: string;
  onChange: (month: string, year: string) => void;
}

/**
 * A birthday by tapping, not typing: a field that opens a sheet with a month
 * list beside a year list.
 *
 * Nothing is preselected, and the years start from this one: part of keeping
 * the sign-up age check neutral (see ageGate in @vitto/core). A picker that
 * opened on, say, 2000 would hand a child the "right" answer.
 */
export function BirthdayPicker({ month, year, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draftMonth, setDraftMonth] = useState(month);
  const [draftYear, setDraftYear] = useState(year);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, index) => String(thisYear - index));
  const chosen = month && year ? `${MONTHS[Number(month) - 1]} ${year}` : null;

  const show = () => {
    setDraftMonth(month);
    setDraftYear(year);
    setOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chosen ? `Birthday, ${chosen}` : 'Choose your birthday'}
        onPress={show}
        style={({ pressed }) => [layout.input, styles.field, pressed && styles.pressed]}
        testID="birthday-field"
      >
        <Text style={chosen ? styles.value : styles.placeholder}>{chosen ?? 'Month and year'}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Your birthday</Text>
          <View style={styles.columns}>
            <ScrollView style={styles.column} contentContainerStyle={styles.columnBody} testID="birthday-months">
              {MONTHS.map((name, index) => {
                const value = String(index + 1);
                const on = draftMonth === value;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={name}
                    onPress={() => setDraftMonth(value)}
                    style={[styles.option, on && styles.optionOn]}
                  >
                    <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView style={styles.column} contentContainerStyle={styles.columnBody} testID="birthday-years">
              {years.map((value) => {
                const on = draftYear === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={value}
                    onPress={() => setDraftYear(value)}
                    style={[styles.option, on && styles.optionOn]}
                  >
                    <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{value}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <PrimaryButton
            label="Done"
            disabled={!draftMonth || !draftYear}
            onPress={() => {
              onChange(draftMonth, draftYear);
              setOpen(false);
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = themedStyles(() => ({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.8 },
  value: { fontSize: 15, color: colors.ink },
  placeholder: { fontSize: 15, color: colors.faint },
  chevron: { fontSize: 16, color: colors.muted, marginTop: -6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 14,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: 12, height: 300 },
  column: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  columnBody: { padding: 6, gap: 2 },
  option: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10 },
  optionOn: { backgroundColor: colors.selectedFill },
  optionLabel: { fontSize: 15, color: colors.ink, textAlign: 'center' },
  optionLabelOn: { color: colors.coralDeep, fontWeight: '700' },
}));
