import { Pressable, Text, TextInput, type TextInputProps } from 'react-native';
import { colors, getColorScheme, themedStyles, fonts } from '../theme';

/**
 * The look of everything before you're in the app: sign-up, sign-in and
 * onboarding share it, so the first screens read as one flow. A soft, rounded
 * face set big, clean surfaces, and the app's coral for "go" and "chosen".
 */

/** The pixel face (Jersey 10, loaded once in App), as the rest of the app. */
export const ONB_FONT = {
  regular: 'Jersey10_400Regular',
  medium: 'Jersey10_400Regular',
  semibold: 'Jersey10_400Regular',
  bold: 'Jersey10_400Regular',
};

/**
 * Clean white, soft greys and the app's coral, in the manner of the best pet
 * apps. Dark mode keeps the shapes and the coral and swaps the greys for the
 * app's dark surfaces. (`green` is the accent: named before it turned coral.)
 */
export const onboardingPalette = () =>
  getColorScheme() === 'dark'
    ? {
        bg: colors.paper,
        text: colors.ink,
        sub: colors.muted,
        soft: colors.cardSoft,
        softEdge: colors.border,
        border: colors.hairline,
        input: colors.card,
        green: colors.coral,
        greenEdge: '#a8432f',
        greenPale: colors.selectedFill,
      }
    : {
        // The pet world's parchment, as every other screen.
        bg: colors.paper,
        text: colors.ink,
        sub: colors.muted,
        soft: colors.cardSoft,
        softEdge: colors.border,
        border: colors.border,
        input: colors.card,
        green: colors.coral,
        greenEdge: '#8e4530',
        greenPale: colors.selectedFill,
      };

/** The big pill button with a pressable ledge: coral to go on, grey for the quieter choice. */
export function OnbButton({
  label,
  onPress,
  disabled,
  busy,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'primary' | 'secondary';
}) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        kit.button,
        primary ? kit.buttonPrimary : kit.buttonSecondary,
        disabled && (primary ? kit.buttonPrimaryOff : kit.buttonSecondaryOff),
        pressed && kit.buttonPressed,
      ]}
    >
      <Text style={[kit.buttonLabel, primary ? kit.buttonLabelPrimary : kit.buttonLabelSecondary]} numberOfLines={1}>
        {busy ? '…' : label}
      </Text>
    </Pressable>
  );
}

/**
 * A soft grey field. Big centred type by default (one answer a page); `form`
 * sets it left-aligned and a little smaller, for a form of several fields.
 */
export function OnbInput({ form, ...props }: TextInputProps & { form?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={onboardingPalette().sub}
      {...props}
      style={[kit.input, form && kit.inputForm, props.style]}
    />
  );
}

/** Shared type and surfaces, for screens built from the kit. */
export const onboardingText = themedStyles(() => {
  const F = onboardingPalette();
  return {
    screen: { flex: 1, backgroundColor: F.bg },
    eyebrow: {
      fontFamily: ONB_FONT.medium,
      fontSize: 18,
      lineHeight: 26,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: F.sub,
    },
    title: { fontFamily: ONB_FONT.bold, fontSize: 39, lineHeight: 47, color: F.text, marginTop: 8 },
    sub: { fontFamily: ONB_FONT.regular, fontSize: 21, lineHeight: 29, color: F.sub, marginTop: 6 },
    label: { fontFamily: ONB_FONT.medium, fontSize: 20, lineHeight: 26, color: F.text, marginBottom: 8 },
    labelHint: { fontFamily: ONB_FONT.regular, color: F.sub },
    body: { fontFamily: ONB_FONT.regular, fontSize: 20, lineHeight: 27, color: F.sub },
    link: { fontFamily: ONB_FONT.medium, fontSize: 21, lineHeight: 27, color: F.sub, textAlign: 'center' },
    linkStrong: { fontFamily: ONB_FONT.semibold, color: F.green },
    error: { fontFamily: ONB_FONT.medium, fontSize: 18, lineHeight: 25, color: colors.danger },
    success: { fontFamily: ONB_FONT.medium, fontSize: 18, lineHeight: 25, color: colors.mintDeep },
    /** A soft rounded panel, for a short list or a notice. */
    card: { borderRadius: 4, borderWidth: 2, borderColor: F.border, backgroundColor: F.input, padding: 18 },
  };
});

const kit = themedStyles(() => {
  const F = onboardingPalette();
  return {
    // A chunky pixel button: ink outline, and a ledge it presses down into.
    button: {
      height: 56,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: colors.shadow,
      borderBottomWidth: 7,
    },
    buttonPrimary: { backgroundColor: F.green, borderBottomColor: F.greenEdge },
    buttonPrimaryOff: { opacity: 0.5 },
    buttonSecondary: { backgroundColor: F.soft, borderBottomColor: F.softEdge },
    buttonSecondaryOff: { opacity: 0.6 },
    buttonPressed: { borderBottomWidth: 3, marginTop: 4, height: 52 },
    buttonLabel: { fontFamily: ONB_FONT.medium, fontSize: 26, lineHeight: 34, paddingHorizontal: 12, textAlign: 'center' },
    buttonLabelPrimary: { color: colors.onCoral },
    buttonLabelSecondary: { color: F.sub },
    input: {
      alignSelf: 'stretch',
      height: 58,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.input,
      paddingHorizontal: 18,
      fontFamily: ONB_FONT.medium,
      fontSize: 26,
      color: F.text,
      textAlign: 'center',
    },
    inputForm: { fontFamily: fonts.pixel, height: 54, fontSize: 22, textAlign: 'left' },
  };
});
