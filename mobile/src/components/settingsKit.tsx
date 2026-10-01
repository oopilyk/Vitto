import { Children, Fragment, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { layout, text } from '../theme';
import { PrimaryButton, TextButton } from './ui';
import { colors, fonts } from '../theme';

/**
 * The building blocks for settings-style screens.
 *
 * The rule they follow: the pet, the pixel art and the copy carry Vitto's
 * personality; the controls around them stay quiet. So sections are grouped by
 * space and a hairline, not a box; a control has a border only where the border
 * says "you can touch this"; and coral is spent on what is selected or primary,
 * never on every outline.
 */

/** The selected tint: a soft coral wash, never just a coral outline. */
export const SELECTED_FILL = '#fbeee9';

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

/**
 * One settings page: a back link naming where it goes, a large title, an
 * optional lead line, then the page's content in a scroll view. `footer` sits
 * pinned to the bottom (a save bar), and the scroll leaves room for it.
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
  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={kit.topbar}>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10} style={kit.back}>
          <Text style={kit.backMark}>←</Text>
          <Text style={kit.backLabel}>{backLabel}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[kit.scroll, { paddingBottom: (footer ? 120 : 48) + HOME_INDICATOR_INSET }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={kit.page}>
          <Text style={kit.pageTitle} accessibilityRole="header">
            {title}
          </Text>
          {lead ? <Text style={kit.pageLead}>{lead}</Text> : null}
          {children}
        </View>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

/**
 * The save bar for a settings page with a draft: pinned to the bottom, shown
 * by the page only once something differs (pass it as SettingsPage's footer).
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
  return (
    <View style={[kit.saveBar, { paddingBottom: HOME_INDICATOR_INSET }]}>
      <View style={kit.saveInner}>
        {error ? <Text style={kit.saveError}>{error}</Text> : null}
        <View style={kit.saveRow}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label={saving ? 'Saving...' : 'Save changes'} busy={saving} onPress={onSave} />
          </View>
          <TextButton label="Discard" onPress={onDiscard} disabled={saving} />
        </View>
      </View>
    </View>
  );
}

/**
 * A titled group of menu rows on one card, the way Instagram and TikTok lay
 * settings out: the title is small and above, the rows are ruled inside.
 */
export function NavGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={kit.navGroup}>
      {title ? <Text style={kit.navGroupTitle}>{title}</Text> : null}
      <View style={kit.list}>
        {rows.map((row, index) => (
          <View key={index} style={index > 0 ? kit.rowRuled : undefined}>
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
          <Text style={kit.navValue} numberOfLines={1}>
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

/** A text input with a clear focus state that does not change its size. */
export function TextField(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
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

/**
 * Two to four short, mutually exclusive options on one track (Metric |
 * Imperial). Labels may wrap to two lines rather than squash, so a long one like
 * "Prefer not to say" still sits well beside "Male".
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
  return (
    <View style={kit.segmentTrack} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [kit.segment, on && kit.segmentOn, pressed && !on && kit.pressed]}
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
      <Pressable
        key={option.value}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [kit.chip, on && kit.chipOn, pressed && !on && kit.pressed]}
      >
        <Text style={[kit.chipLabel, on && kit.chipLabelOn]}>{option.label}</Text>
      </Pressable>
    );
  });
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={kit.chipsScroll}>
      {chips}
    </ScrollView>
  ) : (
    <View style={kit.chips} accessibilityRole="radiogroup">
      {chips}
    </View>
  );
}

/**
 * A list of options as rows in one container, divided by hairlines: radio
 * (one) or checkbox (several). Selected rows get a soft tint, a stronger label
 * and a mark. `expanded` drops content under the selected row.
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
            <Pressable
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityState={multiple ? { checked: on } : { selected: on }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [kit.row, index > 0 && kit.rowRuled, on && kit.rowOn, pressed && !on && kit.pressed]}
            >
              <View style={kit.rowText}>
                <Text style={[kit.rowLabel, on && kit.rowLabelOn]}>{option.label}</Text>
                {option.detail ? <Text style={kit.rowDetail}>{option.detail}</Text> : null}
              </View>
              <View style={[multiple ? kit.checkbox : kit.radio, on && kit.markOn]}>{on ? <Text style={kit.markTick}>✓</Text> : null}</View>
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
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [kit.tile, on && kit.tileOn, pressed && !on && kit.pressed]}
          >
            <View style={[kit.checkbox, kit.tileCheck, on && kit.markOn]}>{on ? <Text style={kit.markTick}>✓</Text> : null}</View>
            <Text style={[kit.tileLabel, on && kit.rowLabelOn]}>{option.label}</Text>
          </Pressable>
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
        trackColor={{ true: colors.coral, false: colors.hairline }}
        thumbColor="#ffffff"
        ios_backgroundColor={colors.hairline}
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

/** A destructive button: red outline and label, filled only while pressed. */
export function DangerButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [kit.dangerButton, pressed && kit.dangerButtonPressed, disabled && kit.disabled]}
    >
      <Text style={kit.dangerButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/** Radii: 12 for controls, 16 for surfaces, pill only for pills. */
const RADIUS_CONTROL = 12;
const RADIUS_SURFACE = 16;

export const kit = StyleSheet.create({
  section: { paddingVertical: 28 },
  sectionRuled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.hairline },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.faint,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  sectionDescription: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: 4 },
  sectionBody: { marginTop: 16, gap: 16 },

  field: { gap: 8 },
  fieldRowItem: { flex: 1, minWidth: 0 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  fieldHint: { fontSize: 13, fontWeight: '400', color: colors.faint },
  fieldRow: { flexDirection: 'row', gap: 12 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: RADIUS_CONTROL,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.coral, backgroundColor: '#ffffff' },

  segmentTrack: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: RADIUS_CONTROL,
    backgroundColor: '#ebe4d6',
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: RADIUS_CONTROL - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: colors.card,
    shadowColor: '#3a2e22',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentLabel: { fontSize: 14, fontWeight: '500', color: colors.muted, textAlign: 'center' },
  segmentLabelOn: { color: colors.ink, fontWeight: '700' },

  list: {
    borderRadius: RADIUS_SURFACE,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 },
  rowRuled: { borderTopWidth: 1, borderTopColor: colors.hairline },
  rowOn: { backgroundColor: SELECTED_FILL },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '500', color: colors.ink },
  rowLabelOn: { fontWeight: '700', color: colors.coralDeep },
  rowDetail: { fontSize: 13, color: colors.muted, lineHeight: 18, marginTop: 2 },
  rowExpanded: { backgroundColor: SELECTED_FILL, paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
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
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  markTick: { color: '#ffffff', fontSize: 12, fontWeight: '800', lineHeight: 14 },

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
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  tileOn: { backgroundColor: SELECTED_FILL, borderColor: '#efc9bd' },
  tileCheck: { width: 20, height: 20 },
  tileLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.ink },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },

  danger: {
    marginTop: 12,
    padding: 18,
    borderRadius: RADIUS_SURFACE,
    borderWidth: 1,
    borderColor: '#ecd2cc',
    backgroundColor: '#fbf5f3',
  },
  dangerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  dangerDescription: { fontSize: 13, color: colors.muted, lineHeight: 19, marginTop: 4 },
  dangerAction: { marginTop: 14, alignItems: 'flex-start' },
  dangerButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonPressed: { backgroundColor: '#f6dcd6' },
  dangerButtonLabel: { fontSize: 15, fontWeight: '600', color: colors.danger },

  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },

  topbar: { paddingHorizontal: 24, paddingTop: 58, paddingBottom: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontSize: 15, fontWeight: '500', color: colors.inkSoft },
  scroll: { paddingHorizontal: 24 },
  page: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  pageTitle: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, marginTop: 4, marginBottom: 8 },
  pageLead: { fontSize: 15, color: colors.muted, lineHeight: 21, marginBottom: 8 },

  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  saveInner: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  saveError: { ...text.error, fontSize: 13, marginBottom: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipsScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 24 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: SELECTED_FILL, borderColor: '#efc9bd' },
  chipLabel: { fontSize: 14, fontWeight: '500', color: colors.inkSoft },
  chipLabelOn: { color: colors.coralDeep, fontWeight: '700' },

  navGroup: { marginTop: 22, gap: 8 },
  navGroupTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    marginLeft: 4,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12 },
  navRowPressed: { backgroundColor: colors.cardSoft },
  navTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
  navTitleDanger: { color: colors.danger, fontWeight: '600' },
  navValue: { fontSize: 13, color: colors.muted, marginTop: 2 },
  navChevron: { fontSize: 24, color: colors.faint, fontWeight: '300', marginTop: -2 },
});
