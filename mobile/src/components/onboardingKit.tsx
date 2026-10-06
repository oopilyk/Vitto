import { Pressable, Text, TextInput, type TextInputProps } from 'react-native';
import { colors, getColorScheme, themedStyles } from '../theme';

/**
 * The look of everything before you're in the app: sign-up, sign-in and
 * onboarding share it, so the first screens read as one flow. A soft, rounded
 * face set big, clean surfaces, and the app's coral for "go" and "chosen".
 */

/** The rounded face (Rubik). Load it with `useFonts` from @expo-google-fonts/rubik. */
export const ONB_FONT = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
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
        bg: '#ffffff',
        text: '#333333',
        sub: '#6b7785',
        soft: '#f0f0f0',
        softEdge: '#d9d9d9',
        border: '#ebebeb',
        input: '#f7f7f7',
        green: colors.coral,
        greenEdge: '#b34a35',
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
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: F.sub,
    },
    title: { fontFamily: ONB_FONT.bold, fontSize: 30, lineHeight: 36, color: F.text, marginTop: 8 },
    sub: { fontFamily: ONB_FONT.regular, fontSize: 16, lineHeight: 22, color: F.sub, marginTop: 6 },
    label: { fontFamily: ONB_FONT.medium, fontSize: 15, lineHeight: 20, color: F.text, marginBottom: 8 },
    labelHint: { fontFamily: ONB_FONT.regular, color: F.sub },
    body: { fontFamily: ONB_FONT.regular, fontSize: 15, lineHeight: 21, color: F.sub },
    link: { fontFamily: ONB_FONT.medium, fontSize: 16, lineHeight: 21, color: F.sub, textAlign: 'center' },
    linkStrong: { fontFamily: ONB_FONT.semibold, color: F.green },
    error: { fontFamily: ONB_FONT.medium, fontSize: 14, lineHeight: 19, color: colors.danger },
    success: { fontFamily: ONB_FONT.medium, fontSize: 14, lineHeight: 19, color: colors.mintDeep },
    /** A soft rounded panel, for a short list or a notice. */
    card: { borderRadius: 22, borderWidth: 2, borderColor: F.border, backgroundColor: F.input, padding: 18 },
  };
});

const kit = themedStyles(() => {
  const F = onboardingPalette();
  return {
    button: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5 },
    buttonPrimary: { backgroundColor: F.green, borderBottomColor: F.greenEdge },
    buttonPrimaryOff: { opacity: 0.5 },
    buttonSecondary: { backgroundColor: F.soft, borderBottomColor: F.softEdge },
    buttonSecondaryOff: { opacity: 0.6 },
    buttonPressed: { borderBottomWidth: 1, marginTop: 4, height: 52 },
    buttonLabel: { fontFamily: ONB_FONT.medium, fontSize: 20, lineHeight: 26, paddingHorizontal: 12, textAlign: 'center' },
    buttonLabelPrimary: { color: '#ffffff' },
    buttonLabelSecondary: { color: F.sub },
    input: {
      alignSelf: 'stretch',
      height: 58,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.input,
      paddingHorizontal: 18,
      fontFamily: ONB_FONT.medium,
      fontSize: 20,
      color: F.text,
      textAlign: 'center',
    },
    inputForm: { height: 54, fontSize: 17, textAlign: 'left' },
  };
});
