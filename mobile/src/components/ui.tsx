import { Fragment, forwardRef, useId, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fonts, layout, text, themedStyles } from '../theme';

/** A light tap felt in the hand: `select` for a choice changing, `press` for an action. */
export const haptic = (kind: 'select' | 'press') => {
  if (Platform.OS === 'web') return;
  const felt = kind === 'select' ? Haptics.selectionAsync?.() : Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light);
  void felt?.catch(() => undefined);
};

/**
 * A Done bar above the keyboard, for iOS's number pads, which have no return
 * key and so no way to put them away. Used through `DoneTextInput`.
 *
 * One bar per field, beside it. React Native's New Architecture attaches an
 * InputAccessoryView to a single field: the first one with its id that is on
 * screen when the bar itself appears, and never looks again. A shared bar
 * mounted once at the root (how this started) therefore reached no field that
 * opened later or in a sheet, which on a phone was every one of them.
 */
export function KeyboardDoneBar({ nativeID }: { nativeID: string }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.doneBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          style={({ pressed }) => pressed && styles.textPressed}
          testID="keyboard-done"
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** Number, decimal and phone pads: the iOS keyboards with no return key to close them. */
export const keypadWithoutReturn = (keyboardType: TextInputProps['keyboardType']): boolean =>
  typeof keyboardType === 'string' && keyboardType.endsWith('-pad');

/**
 * A TextInput with its own Done bar on iOS: what every number field uses,
 * since a number pad has no key to close it. The bar is absolutely
 * positioned, so it takes no room beside the field.
 */
export const DoneTextInput = forwardRef<TextInput, TextInputProps>(function DoneTextInput(props, ref) {
  const id = `vitto-done-${useId()}`;
  if (Platform.OS !== 'ios') return <TextInput ref={ref} {...props} />;
  return (
    <>
      <TextInput ref={ref} {...props} inputAccessoryViewID={id} />
      <KeyboardDoneBar nativeID={id} />
    </>
  );
});

/** What a typed number reads as: blank is no number, and a comma is a decimal point. */
export const parseTypedNumber = (text: string): number | undefined => {
  if (text === '') return undefined;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A number field's text, kept as typed. Turning each keystroke straight into
 * a number and back drops a trailing "." (22. is 22), so 22.5 could never be
 * typed. The text stands while it still reads as the value; anything else
 * (a draft restored, a unit switch, a value the caller clamped) shows the
 * value instead.
 */
export function useNumberText(
  value: number | undefined,
  onValue: (value: number | undefined) => void,
  decimal = false,
) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  // A cleared field stays clear while it is being retyped, even where blank is stored as 0.
  const stands = parseTypedNumber(text) === value || (text === '' && !value);
  const shown = stands ? text : value === undefined ? '' : String(value);
  return {
    value: shown,
    onChangeText: (next: string) => {
      const cleaned = decimal
        ? next.replace(/[^0-9.,]/g, '').replace(/[.,](?=.*[.,])/g, '')
        : next.replace(/[^0-9]/g, '');
      setText(cleaned);
      onValue(parseTypedNumber(cleaned));
    },
  };
}

/** A `DoneTextInput` for a number, typed with `useNumberText`. */
export function NumberInput({
  value,
  onValue,
  decimal = false,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  value: number | undefined;
  onValue: (value: number | undefined) => void;
  decimal?: boolean;
}) {
  const typed = useNumberText(value, onValue, decimal);
  return <DoneTextInput {...props} {...typed} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} />;
}

/**
 * KeyboardAvoidingView for a screen shown as a sheet. React Native works out
 * how much the keyboard covers from where the view sits in its parent, and a
 * sheet starts some way down the screen, so the stock view came up short by
 * that much: the keyboard still covered Finish and the workout's Notes.
 *
 * The sheet's bottom is the screen's bottom, so how far down it starts is the
 * screen's height less its own. (Measuring its position on screen does not
 * work: inside the navigator's sheet that reads 0.)
 */
export function SheetKeyboardAvoidingView({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  if (Platform.OS !== 'ios') return <View style={style}>{children}</View>;
  return (
    <KeyboardAvoidingView
      style={style}
      behavior="padding"
      keyboardVerticalOffset={offset}
      onLayout={(event) => {
        const next = Math.max(0, Dimensions.get('screen').height - event.nativeEvent.layout.height);
        if (Math.abs(next - offset) > 1) setOffset(next);
      }}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How a pressed control gives: quick down, a soft spring back up. */
const PRESS_IN = { toValue: 1, speed: 50, bounciness: 0, useNativeDriver: Platform.OS !== 'web' } as const;
const PRESS_OUT = { toValue: 0, speed: 20, bounciness: 6, useNativeDriver: Platform.OS !== 'web' } as const;

const MARK_PATH = {
  plus: 'M6 1.5 V10.5 M1.5 6 H10.5',
  minus: 'M1.5 6 H10.5',
  cross: 'M2 2 L10 10 M10 2 L2 10',
  check: 'M2 6.4 L4.9 9.2 L10 3',
} as const;
export type MarkKind = keyof typeof MARK_PATH;

/**
 * A plus, minus, tick or cross, drawn rather than typed. A typed "+" or "✓"
 * sits on the font's baseline, not in the middle of its line, so in a circle
 * it always landed low or to one side; drawn, it is centred by construction.
 * Every mark inside a button or a circle is one of these.
 */
export function Mark({
  kind,
  size = 12,
  color = colors.inkSoft,
  weight = 2,
}: {
  kind: MarkKind;
  size?: number;
  color?: string;
  weight?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" accessible={false}>
      <Path d={MARK_PATH[kind]} stroke={color} strokeWidth={(weight * 12) / size} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * The one way out of a logging sheet: a small round button with a cross, top
 * right, as on iOS's own sheets. The cross is drawn, not typed: a "×" glyph
 * sits on the font's baseline and never quite lands in the middle of a circle.
 */
export function CloseButton({ onPress, label = 'Close' }: { onPress: () => void; label?: string }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => {
        haptic('press');
        onPress();
      }}
      style={styles.close}
      testID="sheet-close"
    >
      <Mark kind="cross" size={12} color={colors.muted} />
    </PressableScale>
  );
}

/**
 * A Pressable that sinks a little under the finger and springs back on release,
 * the way iOS controls give. `scaleTo` is how far it goes (0.97 for a button,
 * nearer 1 for a wide card). With Reduce Motion it only dims.
 */
export function PressableScale({
  style,
  scaleTo = 0.97,
  children,
  onPressIn,
  onPressOut,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleTo?: number;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  // The style is on the Pressable itself, so a caller's flex and margins lay it out as before.
  const [pressed, setPressed] = useState(false);
  const transform = reduced ? undefined : [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] }) }];
  const opacity = reduced ? press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) : undefined;
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        Animated.spring(press, PRESS_IN).start();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        Animated.spring(press, PRESS_OUT).start();
        onPressOut?.(event);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, { transform, opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}

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
    <PressableScale
      accessibilityRole="button"
      // Every action closes the keyboard: the screens let a tap through to a
      // button while it is up, and nothing else would put it away.
      onPress={() => {
        Keyboard.dismiss();
        haptic('press');
        onPress();
      }}
      disabled={disabled || busy}
      style={[
        layout.primaryButton,
        // Busy keeps its colour (the spinner says what is happening); not-yet-pressable goes neutral.
        busy ? styles.busy : disabled && styles.disabledButton,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.onCoral} size="small" /> : null}
      <Text style={[layout.primaryLabel, disabled && !busy && styles.disabledLabel]}>{label}</Text>
    </PressableScale>
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
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      disabled={disabled}
      hitSlop={8}
      // iOS text buttons dim under the finger rather than move.
      style={({ pressed }) => pressed && styles.textPressed}
    >
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
      <NumberInput
        style={layout.input}
        value={value}
        onValue={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
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
        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ selected: selected(option.value) }}
          onPress={() => {
            haptic('select');
            onChange(option.value);
          }}
          scaleTo={stacked ? 0.985 : 0.96}
          style={[styles.choice, stacked && styles.choiceWide, selected(option.value) && styles.choiceOn]}
        >
          <Text style={[styles.choiceLabel, selected(option.value) && styles.choiceLabelOn]}>
            {option.label}
          </Text>
          {option.detail ? <Text style={styles.choiceDetail}>{option.detail}</Text> : null}
        </PressableScale>
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
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tile,
  },
  disabled: { opacity: 0.5 },
  busy: { opacity: 0.85 },
  disabledButton: { backgroundColor: colors.disabledFill },
  disabledLabel: { color: colors.onDisabled },
  textButton: { fontFamily: fonts.ui, fontSize: 17 },
  textPressed: { opacity: 0.4 },
  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.cardSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  doneLabel: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.coral },
  // `flexBasis: 'auto'`, not 130: a Field sits in two kinds of parent. In a
  // two-up row the basis is width, and 130 was a sensible floor. In the usual
  // column it became HEIGHT — every field 130px tall — which on web opened a
  // hand's width of empty space between one field and the next. Auto sizes to
  // content either way; `flexGrow` still splits a row evenly.
  field: { marginTop: 14, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '500', color: colors.muted, marginBottom: 7 },
  fieldHint: { color: colors.faint, fontWeight: '400' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  choicesStacked: { flexDirection: 'column' },
  choice: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderCurve: 'continuous',
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
  choiceLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, color: colors.ink },
  choiceLabelOn: { color: colors.coralDeep },
  choiceDetail: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
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
}));
