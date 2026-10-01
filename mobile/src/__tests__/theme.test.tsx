import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { colors, getColorScheme, setActiveColorScheme, themedStyles } from '../theme';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from '@vitto/core';

afterEach(() => setActiveColorScheme('light'));

describe('theme', () => {
  it('answers every colour read in the active scheme', () => {
    setActiveColorScheme('light');
    const light = colors.paper;
    setActiveColorScheme('dark');
    expect(getColorScheme()).toBe('dark');
    expect(colors.paper).not.toBe(light);
  });

  it('builds a sheet per scheme, so the same styles object switches with it', () => {
    const styles = themedStyles(() => ({ box: { backgroundColor: colors.card, color: colors.ink } }));
    setActiveColorScheme('light');
    const day = styles.box;
    setActiveColorScheme('dark');
    expect(styles.box.backgroundColor).not.toBe(day.backgroundColor);
    // Cached: reading again in a scheme returns the same sheet.
    expect(styles.box).toBe(styles.box);
  });

  it('keeps body text readable on its surfaces in both schemes', () => {
    // WCAG relative luminance contrast.
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const scheme of ['light', 'dark'] as const) {
      setActiveColorScheme(scheme);
      for (const surface of [colors.paper, colors.card, colors.cardSoft]) {
        expect(contrast(colors.ink, surface)).toBeGreaterThan(7);
        expect(contrast(colors.inkSoft, surface)).toBeGreaterThan(4.5);
        expect(contrast(colors.muted, surface)).toBeGreaterThan(3);
      }
      // Selected labels sit on the selected wash.
      expect(contrast(colors.coralDeep, colors.selectedFill)).toBeGreaterThan(3);
      // A disabled button's label is still readable.
      expect(contrast(colors.onDisabled, colors.disabledFill)).toBeGreaterThan(2.5);
      // Error text on the page.
      expect(contrast(colors.danger, colors.paper)).toBeGreaterThan(3);
    }
  });
});

describe('appearance settings', () => {
  const profile: BodyProfile = { age: 30, sex: 'other', heightCm: 175, heightUnit: 'cm', weightKg: 74, weightUnit: 'kg', activity: 'moderate', goal: 'maintain', ...PROFILE_SURVEY_DEFAULTS };

  it('has an Appearance row in Settings saying what is set', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<SettingsScreen profile={profile} onClose={() => {}} appearanceLabel="System · Dark" onOpenAppearance={() => (opened += 1)} />);
    });
    expect(JSON.stringify(tree.toJSON())).toContain('System · Dark');
    const row = tree.root.findAllByProps({ accessibilityLabel: 'Appearance' }).find((n: any) => typeof n.props.onPress === 'function');
    act(() => row!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('offers System, Light and Dark, and says which way the phone is set', () => {
    const picks: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<AppearanceScreen preference="system" scheme="dark" onChange={(next) => picks.push(next)} onClose={() => {}} />);
    });
    expect(JSON.stringify(tree.toJSON())).toContain('Dark right now');
    const option = (label: string) =>
      tree.root.findAll((n) => typeof n.props.onPress === 'function').find((n) => n.findAllByType(Text).some((t: any) => t.props.children === label))!;
    act(() => option('Dark').props.onPress());
    act(() => option('Light').props.onPress());
    expect(picks).toEqual(['dark', 'light']);
    tree.unmount();
  });
});
