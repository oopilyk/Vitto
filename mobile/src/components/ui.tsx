import { Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { colors, fonts, layout, text, themedStyles } from '../theme';

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
      // Every action closes the keyboard: the screens let a tap through to a
      // button while it is up, and nothing else would put it away.
      onPress={() => { Keyboard.dismiss(); onPress(); }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        layout.primaryButton,
        // Busy keeps its colour (the spinner says what is happening); not-yet-pressable goes neutral.
        busy ? styles.busy : disabled && styles.disabledButton,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[layout.primaryLabel, disabled && !busy && styles.disabledLabel]}>{label}</Text>
      {busy ? (
        <ActivityIndicator color={colors.onCoral} size="small" />
      ) : (
        <Text style={[styles.arrow, disabled && styles.disabledLabel]}>→</Text>
      )}
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
    <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); onPress(); }} disabled={disabled} hitSlop={8}>
      <Text
        style={[
          styles.textButton,
          // Disabled reads as a quiet grey rather than a faded colour, which all but vanishes on dark.
          { color: disabled ? colors.onDisabled : tone === 'coral' ? colors.coral : colors.muted },
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
  expanded,
}: {
  options: { value: T; label: string; detail?: string }[];
  value: T | T[] | undefined;
  onChange: (value: T) => void;
  stacked?: boolean;
  /**
   * Drops down under the selected option (stacked rows only): settings that
   * belong to that choice, shown where the choice was made.
   */
  expanded?: (value: T) => ReactNode;
}) {
  const selected = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <View style={[styles.choices, stacked && styles.choicesStacked]}>
      {options.map((option) => (
        <Fragment key={option.value}>
        <Pressable
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
        {stacked && expanded && selected(option.value) ? (
          <View style={styles.choiceExpanded} testID={`choice-expanded-${option.value}`}>
            {expanded(option.value)}
          </View>
        ) : null}
        </Fragment>
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

const styles = themedStyles(() => ({
  arrow: { fontFamily: fonts.pixel, color: colors.onCoral, fontSize: 22 },
  // Presses down into its own hard shadow, as the pet world's buttons do.
  pressed: { opacity: 0.88, transform: [{ translateX: 2 }, { translateY: 2 }] },
  disabled: { opacity: 0.5 },
  busy: { opacity: 0.85 },
  disabledButton: { backgroundColor: colors.disabledFill },
  disabledLabel: { color: colors.onDisabled },
  textButton: { fontFamily: fonts.pixel, fontSize: 16, letterSpacing: 0.5 },
  // `flexBasis: 'auto'`, not 130: a Field sits in two kinds of parent. In a
  // two-up row the basis is width, and 130 was a sensible floor. In the usual
  // column it became HEIGHT — every field 130px tall — which on web opened a
  // hand's width of empty space between one field and the next. Auto sizes to
  // content either way; `flexGrow` still splits a row evenly.
  field: { marginTop: 14, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  fieldLabel: { fontFamily: fonts.pixel, fontSize: 13, color: colors.muted, marginBottom: 7, letterSpacing: 0.5 },
  fieldHint: { color: colors.faint },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  choicesStacked: { flexDirection: 'column' },
  choice: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 4,
    paddingVertical: 13,
    paddingHorizontal: 15,
    minWidth: 96,
    flexGrow: 1,
    flexShrink: 1,
  },
  choiceWide: { width: '100%' },
  // Hangs under the chosen option, inset so it reads as belonging to it.
  choiceExpanded: { width: '100%', paddingLeft: 12, paddingRight: 4, paddingTop: 2, paddingBottom: 6, gap: 10 },
  choiceOn: { borderColor: colors.coral, backgroundColor: colors.selectedFill },
  choiceLabel: { fontFamily: fonts.pixelBold, fontSize: 18, color: colors.ink },
  choiceLabelOn: { color: colors.coralDeep },
  choiceDetail: { fontFamily: fonts.pixel, fontSize: 13, color: colors.faint, marginTop: 4, lineHeight: 18 },
  panel: {
    paddingVertical: 18,
    borderBottomWidth: 2,
    borderBottomColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  errorSpacing: { marginTop: 12 },
}));
