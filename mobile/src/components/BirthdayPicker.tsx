import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { ONB_FONT, OnbButton, onboardingPalette } from './onboardingKit';
import { themedStyles } from '../theme';

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
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
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
          <OnbButton
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

// In the sign-up kit's look (see onboardingKit), so it sits among those fields.
const styles = themedStyles(() => {
  const F = onboardingPalette();
  return {
    field: {
      height: 54,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.input,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pressed: { opacity: 0.8 },
    value: { fontFamily: ONB_FONT.medium, fontSize: 17, color: F.text },
    placeholder: { fontFamily: ONB_FONT.medium, fontSize: 17, color: F.sub },
    chevron: { fontSize: 16, color: F.sub, marginTop: -6 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: F.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 34,
      gap: 14,
    },
    title: { fontFamily: ONB_FONT.bold, fontSize: 20, color: F.text, textAlign: 'center' },
    columns: { flexDirection: 'row', gap: 12, height: 300 },
    column: { flex: 1, borderWidth: 2, borderColor: F.border, borderRadius: 22, backgroundColor: F.input },
    columnBody: { padding: 6, gap: 2 },
    option: { paddingVertical: 11, paddingHorizontal: 12, borderRadius: 16 },
    optionOn: { backgroundColor: F.greenPale },
    optionLabel: { fontFamily: ONB_FONT.medium, fontSize: 16, color: F.text, textAlign: 'center' },
    optionLabelOn: { fontFamily: ONB_FONT.bold, color: F.green },
  };
});
