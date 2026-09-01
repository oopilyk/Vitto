import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, layout, text } from '../theme';

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={text.kicker}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        layout.primaryButton,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={layout.primaryLabel}>{label}</Text>
      {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.arrow}>→</Text>}
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  disabled,
  tone = 'muted',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'muted' | 'coral';
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text
        style={[
          styles.textButton,
          { color: tone === 'coral' ? colors.coral : colors.muted },
          disabled && styles.disabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {hint ? <Text style={styles.fieldHint}> {hint}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        style={layout.input}
        keyboardType="number-pad"
        value={value === undefined ? '' : String(value)}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        onChangeText={(next) => {
          const digits = next.replace(/[^0-9.]/g, '');
          onChange(digits === '' ? undefined : Number(digits));
        }}
      />
    </Field>
  );
}

/** The web app's pill selectors, as a row of tappable chips. */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  stacked,
}: {
  options: { value: T; label: string; detail?: string }[];
  value: T | T[] | undefined;
  onChange: (value: T) => void;
  stacked?: boolean;
}) {
  const selected = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <View style={[styles.choices, stacked && styles.choicesStacked]}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: selected(option.value) }}
          onPress={() => onChange(option.value)}
          style={[styles.choice, stacked && styles.choiceWide, selected(option.value) && styles.choiceOn]}
        >
          <Text style={[styles.choiceLabel, selected(option.value) && styles.choiceLabelOn]}>
            {option.label}
          </Text>
          {option.detail ? <Text style={styles.choiceDetail}>{option.detail}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <Text style={[text.error, styles.errorSpacing]}>{children}</Text> : null;
}

const styles = StyleSheet.create({
  arrow: { color: '#fff', fontSize: 17 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  textButton: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.5 },
  field: { marginTop: 14, flexGrow: 1, flexBasis: 150 },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginBottom: 7, letterSpacing: 0.5 },
  fieldHint: { color: colors.faint },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  choicesStacked: { flexDirection: 'column' },
  choice: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 15,
    minWidth: 104,
    flexGrow: 1,
  },
  choiceWide: { width: '100%' },
  choiceOn: { borderColor: colors.coral, backgroundColor: '#fbf1ee' },
  choiceLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  choiceLabelOn: { color: colors.coralDeep },
  choiceDetail: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 4, lineHeight: 14 },
  panel: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  errorSpacing: { marginTop: 12 },
});
