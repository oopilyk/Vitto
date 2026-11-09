import { Children, Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { layout, text, themedStyles } from '../theme';
import { DoneTextInput, PressableScale, PrimaryButton, TextButton, haptic, keypadWithoutReturn, Mark } from './ui';
import { colors, fonts } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * The building blocks for settings-style screens, in the iOS idiom: a large
 * title that hands over to the bar as the page scrolls, inset grouped lists,
 * San Francisco at the system's sizes, and controls that give under the finger
 * and spring back.
 *
 * The rule they follow: the pet, the pixel art and the copy carry Vitto's
 * personality; the controls around them stay quiet. Surfaces are told apart by
 * tone, not outlines; coral is spent on what is selected or primary.
 */

const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * A section of a settings page: an optional small eyebrow, a title, a line of
 * supporting copy, then its controls. No border; sections are separated by
 * space and a hairline rule.
 */
export function SettingsSection({
  title,
  description,
  eyebrow,
  first,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  /** The first section on the page has no rule above it. */
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[kit.section, !first && kit.sectionRuled]}>
      {eyebrow ? <Text style={kit.eyebrow}>{eyebrow}</Text> : null}
      <Text style={kit.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={kit.sectionDescription}>{description}</Text> : null}
      <View style={kit.sectionBody}>{children}</View>
    </View>
  );
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** Settings content stops growing here, so tablet and desktop previews keep phone-like controls. */
export const SETTINGS_MAX_WIDTH = 640;

/** How far the page scrolls before the large title has gone under the bar. */
const TITLE_HANDOFF = [28, 48];

/**
 * One settings page: a back link naming where it goes, a large title, an
 * optional lead line, then the page's content in a scroll view. As the large
 * title scrolls away the same title fades into the bar, over a hairline, as in
 * iOS. `footer` sits pinned to the bottom (a save bar), and the scroll leaves
 * room for it.
 */
export function SettingsPage({
  title,
  lead,
  backLabel,
  onBack,
  footer,
  children,
}: {
  title: string;
  lead?: string;
  backLabel: string;
  onBack: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const handedOff = scrollY.interpolate({ inputRange: TITLE_HANDOFF, outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={kit.topbar}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => [kit.back, pressed && kit.backPressed]}
        >
          <Text style={kit.backMark}>‹</Text>
          <Text style={kit.backLabel}>{backLabel}</Text>
        </Pressable>
        {/* The bar's copy of the title, for once the large one has scrolled away: decoration to a screen reader. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[kit.barTitleWrap, { opacity: handedOff }]}
        >
          <Text style={kit.barTitle} numberOfLines={1} testID="settings-bar-title">
            {title}
          </Text>
        </Animated.View>
        <Animated.View style={[kit.barRule, { opacity: handedOff }]} />
      </View>
      <Animated.ScrollView
        contentContainerStyle={[kit.scroll, { paddingBottom: (footer ? 120 : 48) + HOME_INDICATOR_INSET }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: NATIVE_DRIVER })}
      >
        <View style={kit.page}>
          <Text style={kit.pageTitle} accessibilityRole="header">
            {title}
          </Text>
          {lead ? <Text style={kit.pageLead}>{lead}</Text> : null}
          {children}
        </View>
      </Animated.ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

/**
 * A bar pinned to the bottom of a settings page, for an action that should
 * never be a scroll away (pass it as SettingsPage's footer). Same look as SaveBar.
 */
export function PinnedBar({ children }: { children: ReactNode }) {
  return (
    <View style={[kit.saveBar, { paddingBottom: HOME_INDICATOR_INSET }]}>
      <View style={[kit.saveInner, kit.pinnedInner]}>{children}</View>
    </View>
  );
}

/**
 * The save bar for a settings page with a draft: pinned to the bottom, shown
 * by the page only once something differs (pass it as SettingsPage's footer).
 * It rises into place rather than appearing.
 */
export function SaveBar({
  saving,
  error,
  onSave,
  onDiscard,
}: {
  saving: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(reduced ? 0 : 1)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 0, speed: 16, bounciness: 4, useNativeDriver: NATIVE_DRIVER }).start();
  }, [rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  const opacity = rise.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <Animated.View style={[kit.saveBar, { paddingBottom: HOME_INDICATOR_INSET, opacity, transform: [{ translateY }] }]}>
      <View style={kit.saveInner}>
        {error ? <Text style={kit.saveError}>{error}</Text> : null}
        <View style={kit.saveRow}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label={saving ? 'Saving...' : 'Save changes'} busy={saving} onPress={onSave} />
          </View>
          <TextButton label="Discard" onPress={onDiscard} disabled={saving} />
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * A titled group of menu rows on one card, as iOS Settings lays them out: the
 * title small and above, the rows divided by hairlines inset from the left.
 */
export function NavGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={kit.navGroup}>
      {title ? <Text style={kit.navGroupTitle}>{title}</Text> : null}
      <View style={kit.list}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={kit.separator} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One menu row: a title, an optional line saying what is set now, and a
 * chevron. Pressing it opens that setting's own page. `danger` is for the one
 * destructive entry.
 */
export function NavRow({
  title,
  value,
  leading,
  onPress,
  danger,
  testID,
}: {
  title: string;
  /** What it is set to now, e.g. "On" or "Kyle · 21 · Build muscle". */
  value?: string;
  /** Art on the left, e.g. the pet. */
  leading?: ReactNode;
  onPress: () => void;
  danger?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [kit.navRow, pressed && kit.navRowPressed]}
      testID={testID}
    >
      {leading}
      <View style={kit.rowText}>
        <Text style={[kit.navTitle, danger && kit.navTitleDanger]}>{title}</Text>
        {value ? (
          <Text style={kit.navValue} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {danger ? null : <Text style={kit.navChevron}>›</Text>}
    </Pressable>
  );
}

/** A labelled control. The label is a plain, readable sans label; the hint is quieter. */
export function FormField({ label, hint, children, style }: { label: string; hint?: string; children: ReactNode; style?: object }) {
  return (
    <View style={[kit.field, style]}>
      <Text style={kit.fieldLabel}>
        {label}
        {hint ? <Text style={kit.fieldHint}>{`  ${hint}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

/** Two controls side by side (age | weight, feet | inches). */
export function FieldRow({ children }: { children: ReactNode }) {
  // Each field takes an equal share of the row; outside a row a field is its natural height.
  return (
    <View style={kit.fieldRow}>
      {Children.map(children, (child) => (child ? <View style={kit.fieldRowItem}>{child}</View> : null))}
    </View>
  );
}

/** How long "Saved" stays up before the bar goes. */
export const SAVED_NOTE_MS = 2200;

/**
 * After a save that stays on the page: `show()` once it has really gone
 * through, and `saved` is true for a moment, for a `SavedBar` where the Save
 * bar was. The Save bar simply vanishing read as nothing having happened.
 */
export function useSavedNote() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return {
    saved,
    show: () => {
      haptic('press');
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), SAVED_NOTE_MS);
    },
  };
}

/** "Saved", where the Save bar was. */
export function SavedBar({ label = 'Saved' }: { label?: string }) {
  return (
    <View style={[kit.saveBar, { paddingBottom: HOME_INDICATOR_INSET }]} accessibilityLiveRegion="polite" testID="saved-bar">
      <View style={[kit.saveInner, kit.savedRow]}>
        <Mark kind="check" size={14} weight={2.4} color={colors.mintDeep} />
        <Text style={kit.savedLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** A text input with a clear focus state that does not change its size. */
export function TextField(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  // A number pad has no key to close it, so it brings a Done bar.
  const Input = keypadWithoutReturn(props.keyboardType) ? DoneTextInput : TextInput;
  return (
    <Input
      placeholderTextColor={colors.faint}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={[kit.input, focused && kit.inputFocused, props.style]}
    />
  );
}

/** The track's inset around the thumb. */
const SEGMENT_INSET = 2;

/**
 * Two to four short, mutually exclusive options on one track (Metric |
 * Imperial), as iOS draws them: a raised thumb that springs across to the
 * option picked. Labels may wrap to two lines rather than squash, so a long one
 * like "Prefer not to say" still sits well beside "Male".
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  const index = options.findIndex((option) => option.value === value);
  const [width, setWidth] = useState(0);
  const position = useRef(new Animated.Value(Math.max(index, 0))).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (index < 0) return;
    if (reduced) position.setValue(index);
    else Animated.spring(position, { toValue: index, speed: 18, bounciness: 3, useNativeDriver: NATIVE_DRIVER }).start();
  }, [index, position, reduced]);
  const segmentWidth = width > 0 ? (width - SEGMENT_INSET * 2) / options.length : 0;
  return (
    <View style={kit.segmentTrack} accessibilityRole="radiogroup" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {index >= 0 && segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[kit.segmentThumb, { width: segmentWidth, transform: [{ translateX: Animated.multiply(position, segmentWidth) }] }]}
        />
      ) : null}
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) haptic('select');
              onChange(option.value);
            }}
            style={({ pressed }) => [kit.segment, pressed && !on && kit.pressed]}
          >
            <Text style={[kit.segmentLabel, on && kit.segmentLabelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Short single-pick options as pills that wrap (or scroll, with `scroll`):
 * months, a diet, a step goal. Selected takes the coral wash, like the rest.
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** One scrolling line instead of wrapping, for long runs like months. */
  scroll?: boolean;
}) {
  const chips = options.map((option) => {
    const on = option.value === value;
    return (
      <PressableScale
        key={option.value}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => {
          if (!on) haptic('select');
          onChange(option.value);
        }}
        scaleTo={0.94}
        style={[kit.chip, on && kit.chipOn]}
      >
        <Text style={[kit.chipLabel, on && kit.chipLabelOn]}>{option.label}</Text>
      </PressableScale>
    );
  });
  return scroll ? (
    <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={kit.chipsScroll}>
      {chips}
    </Animated.ScrollView>
  ) : (
    <View style={kit.chips} accessibilityRole="radiogroup">
      {chips}
    </View>
  );
}

/**
 * A list of options as rows in one container, divided by hairlines: radio
 * (one) or checkbox (several). A picked row gets a coral check on the right,
 * as in iOS. `expanded` drops content under the selected row.
 */
export function SelectionList<T extends string>({
  options,
  value,
  onChange,
  multiple,
  expanded,
}: {
  options: { value: T; label: string; detail?: string }[];
  value: T | T[] | undefined;
  onChange: (value: T) => void;
  multiple?: boolean;
  expanded?: (value: T) => ReactNode;
}) {
  const isOn = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <View style={kit.list}>
      {options.map((option, index) => {
        const on = isOn(option.value);
        return (
          <Fragment key={option.value}>
            {index > 0 ? <View style={kit.separator} /> : null}
            <Pressable
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={multiple ? { checked: on } : { selected: on }}
              onPress={() => {
                haptic('select');
                onChange(option.value);
              }}
              style={({ pressed }) => [kit.row, pressed && kit.navRowPressed]}
            >
              <View style={kit.rowText}>
                <Text style={[kit.rowLabel, on && kit.rowLabelOn]}>{option.label}</Text>
                {option.detail ? <Text style={kit.rowDetail}>{option.detail}</Text> : null}
              </View>
              {multiple ? (
                <View style={[kit.checkbox, on && kit.markOn]}>{on ? <Mark kind="check" size={11} weight={2.2} color={colors.onCoral} /> : null}</View>
              ) : (
                <View style={[kit.check, !on && kit.checkOff]}>
                  <Mark kind="check" size={14} weight={2.2} color={colors.coral} />
                </View>
              )}
            </Pressable>
            {expanded && on ? (
              <View style={kit.rowExpanded} testID={`choice-expanded-${option.value}`}>
                {expanded(option.value)}
              </View>
            ) : null}
          </Fragment>
        );
      })}
    </View>
  );
}

/** Compact multi-select tiles, two to a row, each with a check when on. */
export function SelectionTiles<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={kit.tiles}>
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => {
              haptic('select');
              onChange(option.value);
            }}
            style={[kit.tile, on && kit.tileOn]}
          >
            <View style={[kit.checkbox, kit.tileCheck, on && kit.markOn]}>{on ? <Mark kind="check" size={11} weight={2.2} color={colors.onCoral} /> : null}</View>
            <Text style={[kit.tileLabel, on && kit.rowLabelOn]}>{option.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** An on/off preference as a row with a switch, rather than two "On"/"Off" cards. */
export function ToggleRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={kit.toggle}>
      <View style={kit.rowText}>
        <Text style={kit.rowLabel}>{title}</Text>
        {description ? <Text style={kit.rowDetail}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.coral, false: colors.track }}
        thumbColor="#ffffff"
        ios_backgroundColor={colors.track}
        accessibilityLabel={title}
        {...({ activeThumbColor: '#ffffff' } as object)}
      />
    </View>
  );
}

/**
 * The destructive end of the page, set apart from the preferences above it.
 * Red is used for the action alone.
 */
export function DangerZone({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <View style={kit.danger}>
      <Text style={kit.dangerTitle}>{title}</Text>
      <Text style={kit.dangerDescription}>{description}</Text>
      <View style={kit.dangerAction}>{children}</View>
    </View>
  );
}

/** A destructive button: red label on a red wash, deeper while pressed. */
export function DangerButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [kit.dangerButton, pressed && kit.dangerButtonPressed, disabled && kit.disabled]}
    >
      <Text style={kit.dangerButtonLabel}>{label}</Text>
    </PressableScale>
  );
}

/** Radii: 12 for controls, 14 for grouped lists, 16 for surfaces, pill only for pills. All continuous, as iOS draws them. */
const RADIUS_CONTROL = 12;
const RADIUS_LIST = 14;
const RADIUS_SURFACE = 16;

export const kit = themedStyles(() => ({
  section: { paddingVertical: 24 },
  sectionRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  eyebrow: {
    fontFamily: fonts.ui,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.faint,
    marginBottom: 6,
  },
  sectionTitle: { fontFamily: fonts.ui, fontSize: 22, fontWeight: '700', color: colors.ink },
  sectionDescription: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, lineHeight: 21, marginTop: 4 },
  sectionBody: { marginTop: 16, gap: 16 },

  field: { gap: 8 },
  fieldRowItem: { flex: 1, minWidth: 0 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  fieldHint: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '400', color: colors.faint },
  fieldRow: { flexDirection: 'row', gap: 12 },
  input: {
    fontFamily: fonts.ui,
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: RADIUS_CONTROL,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.coral, backgroundColor: colors.inputFocus },

  segmentTrack: {
    flexDirection: 'row',
    padding: SEGMENT_INSET,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.track,
  },
  // The picked option's raised thumb, drawn once under the labels and slid between them.
  segmentThumb: {
    position: 'absolute',
    top: SEGMENT_INSET,
    bottom: SEGMENT_INSET,
    left: SEGMENT_INSET,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: colors.raised,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '500', color: colors.muted, textAlign: 'center' },
  segmentLabelOn: { color: colors.ink, fontWeight: '600' },

  list: {
    borderRadius: RADIUS_LIST,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  // Rows are divided by a hairline that starts where their text does.
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 11 },
  rowRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  rowOn: { backgroundColor: colors.selectedFill },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.ink },
  rowLabelOn: { fontWeight: '600' },
  rowDetail: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 2 },
  rowExpanded: { backgroundColor: colors.cardSoft, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 14 },
  check: { width: 20, alignItems: 'center', justifyContent: 'center' },
  checkOff: { opacity: 0 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  markTick: { fontFamily: fonts.ui, fontWeight: '700', color: colors.onCoral, fontSize: 13, lineHeight: 16 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS_CONTROL,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.card,
  },
  tileOn: { backgroundColor: colors.selectedFill, borderColor: colors.selectedBorder },
  tileCheck: { width: 20, height: 20 },
  tileLabel: { fontFamily: fonts.ui, flex: 1, fontSize: 16, fontWeight: '500', color: colors.ink },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },

  danger: {
    marginTop: 12,
    padding: 18,
    borderRadius: RADIUS_SURFACE,
    borderCurve: 'continuous',
    backgroundColor: colors.dangerWash,
  },
  dangerTitle: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.ink },
  dangerDescription: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, lineHeight: 21, marginTop: 4 },
  dangerAction: { marginTop: 14, alignItems: 'flex-start' },
  dangerButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: RADIUS_CONTROL,
    borderCurve: 'continuous',
    backgroundColor: colors.dangerPressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonPressed: { opacity: 0.8 },
  dangerButtonLabel: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.danger },

  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },

  topbar: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 2, backgroundColor: colors.paper, zIndex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, alignSelf: 'flex-start', paddingRight: 8 },
  backPressed: { opacity: 0.4 },
  backMark: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, fontWeight: '400', color: colors.coral, marginTop: -4 },
  backLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
  barTitleWrap: { position: 'absolute', left: 96, right: 96, bottom: 2, minHeight: 44, justifyContent: 'center' },
  barTitle: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  barRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  scroll: { paddingHorizontal: 20 },
  page: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  pageTitle: { fontFamily: fonts.ui, fontSize: 34, fontWeight: '700', color: colors.ink, marginTop: 2, marginBottom: 6 },
  pageLead: { fontFamily: fonts.ui, fontSize: 17, color: colors.muted, lineHeight: 23, marginBottom: 6 },

  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  saveInner: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pinnedInner: { gap: 8 },
  saveError: { ...text.error, marginBottom: 10 },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  savedLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.mintDeep },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 24 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  chipLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '500', color: colors.inkSoft },
  chipLabelOn: { color: colors.onCoral, fontWeight: '600' },

  navGroup: { marginTop: 24, gap: 7 },
  navGroupTitle: {
    fontFamily: fonts.ui,
    fontSize: 13,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginLeft: 16,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 11 },
  navRowPressed: { backgroundColor: colors.cardSoft },
  navTitle: { fontFamily: fonts.ui, fontSize: 17, color: colors.ink },
  navTitleDanger: { color: colors.danger },
  navValue: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, marginTop: 1 },
  navChevron: { fontFamily: fonts.ui, fontSize: 24, color: colors.faint, fontWeight: '400', marginTop: -2 },
}));
