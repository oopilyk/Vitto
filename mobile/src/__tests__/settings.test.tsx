import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { type BodyProfile, PROFILE_SURVEY_DEFAULTS, measurementSystemOf } from '@vitto/core';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { PreferencesScreen } from '../screens/PreferencesScreen';
import { PersonalityScreen } from '../screens/PersonalityScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { ScreenTimeScreen } from '../screens/ScreenTimeScreen';
import { ActivityHistoryScreen } from '../screens/ActivityHistoryScreen';
import { LiftProgressScreen } from '../screens/LiftProgressScreen';

const profile: BodyProfile = {
  age: 30,
  sex: 'other',
  heightCm: 175,
  heightUnit: 'cm',
  weightKg: 74,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 68,
  goalWeeks: 12,
  ...PROFILE_SURVEY_DEFAULTS,
};

const findButton = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t: any) => t.props.children === label));

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAllByProps({ accessibilityLabel: label })
    .find((node: any) => typeof node.props.onPress === 'function');

const json = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

const render = (
  body: BodyProfile = profile,
  onSave: (next: BodyProfile) => Promise<void> = async () => {},
  onClose: () => void = () => {},
) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PreferencesScreen profile={body} onSave={onSave} onClose={onClose} />);
  });
  return tree;
};

describe('preferences screen', () => {
  it('holds the body profile form', () => {
    const tree = render();
    const screen = json(tree);
    expect(screen).toContain('About you');
    expect(screen).toContain('Your goal');
    expect(screen).toContain('Your training');
    expect(screen).toContain('What you want from Vitto');
    tree.unmount();
  });

  it('hides the save bar until something changes, then saves', async () => {
    const saved: BodyProfile[] = [];
    const tree = render(profile, async (next) => {
      saved.push(next);
    });
    expect(findButton(tree, 'Save changes')).toBeUndefined();

    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    expect(findButton(tree, 'Save changes')).toBeTruthy();

    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.goal).toBe('gain');
    tree.unmount();
  });

  it('discards edits back to the saved profile', () => {
    const tree = render();
    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    expect(findButton(tree, 'Discard')).toBeTruthy();

    act(() => findButton(tree, 'Discard')!.props.onPress());
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    tree.unmount();
  });

  it('changes both units together from the one Units toggle', () => {
    const tree = render();
    expect(measurementSystemOf(profile)).toBe('metric');

    act(() => findButton(tree, 'Imperial')!.props.onPress());

    const rendered = json(tree);
    expect(rendered).toContain('Weight (lb)');
    expect(rendered).toContain('Height (ft)');
    expect(rendered).not.toContain('Weight (kg)');
    tree.unmount();
  });

  it("shows plan weights in the user's own unit", () => {
    const imperial = { ...profile, weightUnit: 'lb' as const, heightUnit: 'ft' as const, targetWeightKg: 65 };
    const tree = render(imperial);
    const rendered = json(tree);
    // The plan is computed in kg internally; nothing may say "kg" to someone
    // working in pounds.
    expect(rendered).toContain('lb');
    expect(rendered).not.toMatch(/\d\s?kg/);
    tree.unmount();
  });

  it('has a display-name field that rides the ordinary save bar', async () => {
    const saved: BodyProfile[] = [];
    const tree = render(profile, async (next) => {
      saved.push(next);
    });
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    const nameInput = tree.root.findAllByType(TextInput).find((node: any) => node.props.maxLength === 40);
    expect(nameInput).toBeTruthy();
    act(() => nameInput!.props.onChangeText('Kyle'));
    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved[0]!.displayName).toBe('Kyle');
    tree.unmount();
  });

  it('shows a save failure inline and keeps the edits', async () => {
    const tree = render(profile, async () => {
      throw new Error('No connection.');
    });
    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(json(tree)).toContain('No connection.');
    expect(findButton(tree, 'Save changes')).toBeTruthy();
    tree.unmount();
  });

  it('goes back to Settings from the top bar', () => {
    let closed = 0;
    const tree = render(profile, async () => {}, () => {
      closed += 1;
    });
    act(() => findButton(tree, 'Settings')!.props.onPress());
    expect(closed).toBe(1);
    tree.unmount();
  });
});

describe('settings menu', () => {
  const opened: string[] = [];
  const renderMenu = (extra: Partial<React.ComponentProps<typeof SettingsScreen>> = {}) => {
    opened.length = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsScreen
          profile={{ ...profile, displayName: 'Kyle' }}
          onClose={() => opened.push('back')}
          breed="bichon"
          onBreedChange={() => {}}
          coins={120}
          breedChangeCost={500}
          pet={{ name: 'Blue', personality: 'sweet', dials: undefined, persona: undefined }}
          notificationsOn
          onOpenPlus={() => opened.push('plus')}
          onOpenChooseCompanion={() => opened.push('animal')}
          onOpenPersonality={() => opened.push('personality')}
          onOpenNotifications={() => opened.push('notifications')}
          onOpenPreferences={() => opened.push('preferences')}
          onOpenDeleteAccount={() => opened.push('delete')}
          {...extra}
        />,
      );
    });
    return tree;
  };

  it('is a list of rows, each saying what it is set to and opening its own page', () => {
    const tree = renderMenu();
    const screen = json(tree);
    // No forms on the menu itself.
    expect(screen).not.toContain('About you');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(screen).toContain('120 coins');
    expect(screen).toContain('Kyle · 30 · Lose fat');
    expect(screen).toContain('On');

    for (const [label, page] of [
      ['Vitto Plus', 'plus'],
      ['Animal', 'animal'],
      ['Personality', 'personality'],
      ['Notifications', 'notifications'],
      ['Your preferences', 'preferences'],
      ['Delete account', 'delete'],
    ]) {
      act(() => byLabel(tree, label!)!.props.onPress());
      expect(opened.at(-1)).toBe(page);
    }
    act(() => findButton(tree, 'Profile')!.props.onPress());
    expect(opened.at(-1)).toBe('back');
    tree.unmount();
  });

  it('says personalities are Plus on the free tier', () => {
    const tree = renderMenu({ canCustomise: false });
    expect(json(tree)).toContain('A Plus feature');
    tree.unmount();
  });

  it('leaves out rows whose page is not wired up', () => {
    const tree = renderMenu({ onBreedChange: undefined, onOpenDeleteAccount: undefined, notificationsOn: null });
    expect(byLabel(tree, 'Animal')).toBeUndefined();
    expect(byLabel(tree, 'Delete account')).toBeUndefined();
    expect(byLabel(tree, 'Notifications')).toBeUndefined();
    tree.unmount();
  });
});

describe('delete account page', () => {
  it('says what it destroys, then deletes', async () => {
    let deleted = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DeleteAccountScreen
          onClose={() => {}}
          onDeleteAccount={async () => {
            deleted += 1;
          }}
        />,
      );
    });
    const rendered = json(tree);
    // The warning has to name the shared-pet outcome, which is the surprising part.
    expect(rendered).toContain('cannot be undone');
    expect(rendered).toContain('care partner');
    await act(async () => {
      await findButton(tree, 'Delete account')!.props.onPress();
    });
    expect(deleted).toBe(1);
    tree.unmount();
  });
});

describe('notifications page', () => {
  it('shows only the toggles this device can use', () => {
    const changed: boolean[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <NotificationsScreen petName="Blue" pushEnabled onPushEnabledChange={(next) => changed.push(next)} islandEnabled={null} onClose={() => {}} />,
      );
    });
    const rendered = json(tree);
    expect(rendered).toContain('Blue can message you');
    expect(rendered).not.toContain('Dynamic Island');
    tree.unmount();
  });
});

describe('profile screen → settings', () => {
  const renderProfile = (onOpenSettings?: () => void) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          events={[]}
          onClose={() => {}}
          onOpenSettings={onOpenSettings}
        />,
      );
    });
    return tree;
  };

  it('no longer carries the body profile form, and opens Settings from the top bar', () => {
    let opened = 0;
    const tree = renderProfile(() => {
      opened += 1;
    });
    const screen = json(tree);
    expect(screen).not.toContain('About you');
    expect(screen).not.toContain('Your goal');
    expect(screen).not.toContain('Your training');
    expect(findButton(tree, 'Build muscle')).toBeUndefined();

    act(() => byLabel(tree, 'Open settings')!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('hides the Settings button when no route is wired up', () => {
    const tree = renderProfile();
    expect(byLabel(tree, 'Open settings')).toBeUndefined();
    tree.unmount();
  });
});

describe('personality page', () => {
  it('edits base, sliders and notes together, saving once', async () => {
    const saved: unknown[] = [];
    const pet = { name: 'Blue', personality: 'sweet' as const, dials: undefined, persona: undefined };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PersonalityScreen pet={pet} age={profile.age} onClose={() => {}} onSave={async (next) => { saved.push(next); return null; }} />,
      );
    });
    const button = (label: string) =>
      tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t: any) => t.props.children === label))[0];
    const save = () => button('Save character');
    // Nothing to save until something changes.
    expect(save().props.accessibilityState).toEqual({ disabled: true });
    act(() => button('Savage').props.onPress());
    act(() => tree.root.findAll((n) => n.props.testID === 'dial-blunt-0' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(save().props.accessibilityState).toEqual({ disabled: false });
    await act(async () => save().props.onPress());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ personality: 'savage', dials: { blunt: 0, sarcastic: 0.92 }, persona: '' });
  });

  it('shows what Plus would unlock instead of the editor on the free tier', () => {
    let tree!: renderer.ReactTestRenderer;
    const pet = { name: 'Blue', personality: 'sweet' as const, dials: undefined, persona: undefined };
    act(() => { tree = renderer.create(<PersonalityScreen pet={pet} age={30} canCustomise={false} onSave={() => {}} onClose={() => {}} />); });
    expect(tree.root.findAll((n) => n.props.testID === 'character-dials')).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.testID === 'personality-locked').length).toBeGreaterThan(0);
  });
});

describe('screen time page', () => {
  it('saves the budget through its own save bar, and logs today against the budget shown', async () => {
    const saved: BodyProfile[] = [];
    const logged: [number, number | undefined][] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ScreenTimeScreen
          profile={profile}
          events={[]}
          onSave={async (next) => {
            saved.push(next);
          }}
          onLogScreenTime={async (minutes, budget) => {
            logged.push([minutes, budget]);
          }}
          onClose={() => {}}
        />,
      );
    });
    const field = (label: string) => tree.root.findAllByProps({ accessibilityLabel: label }).find((n: any) => typeof n.props.onChangeText === 'function')!;
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    act(() => field('Budget hours').props.onChangeText('1'));
    act(() => field('Budget minutes').props.onChangeText('30'));
    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved[0]!.screenTimeBudgetMinutes).toBe(90);

    act(() => field('Today hours').props.onChangeText('2'));
    await act(async () => {
      await findButton(tree, "Log today's screen time")!.props.onPress();
    });
    expect(logged).toEqual([[120, 90]]);
    tree.unmount();
  });
});

describe('activity history page', () => {
  it('groups moments under a heading per day', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    const event = (id: string, at: Date) => ({ id, type: 'WORKOUT', occurredAt: at.toISOString(), metadata: {} }) as any;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ActivityHistoryScreen events={[event('a', now), event('b', yesterday)]} onClose={() => {}} />);
    });
    const rendered = json(tree);
    expect(rendered).toContain('Today');
    expect(rendered).toContain('Yesterday');
    expect(rendered).toContain('2 care moments');
    tree.unmount();
  });
});

describe('lift progress', () => {
  const bench = (day: string, weight: number, reps: number) =>
    ({
      id: day,
      type: 'WORKOUT',
      occurredAt: `2026-09-${day}T12:00:00Z`,
      metadata: {
        workoutType: 'strength',
        durationMinutes: 60,
        exercises: [{ id: 'e', name: 'Bench Press', muscleGroup: 'chest', sets: [{ id: 's', reps, weight, unit: 'lb', completed: true }] }],
      },
    }) as any;
  const lifter = { ...profile, sex: 'male' as const, weightKg: 80, weightUnit: 'lb' as const };

  it('opens from the arrow on Personal records', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ProfileScreen profile={profile} events={[]} onClose={() => {}} onOpenLiftProgress={() => (opened += 1)} />);
    });
    act(() => byLabel(tree, 'See lift progress')!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('shows the latest estimated max, the change since the first session, and each session', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<LiftProgressScreen profile={lifter} events={[bench('10', 185, 5), bench('20', 205, 5)]} onClose={() => {}} />);
    });
    const rendered = json(tree);
    // 205 x 5 -> ~239 lb; 185 x 5 -> ~216 lb.
    expect(rendered).toMatch(/23[89]/);
    expect(rendered).toMatch(/\+2[34] lb since/);
    expect(rendered).toContain('Bench Press · 205 lb × 5');
    expect(rendered).toContain('more to ');
    tree.unmount();
  });

  it('keeps the headline numbers but locks the graph and sessions behind Plus', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <LiftProgressScreen profile={lifter} events={[bench('10', 185, 5), bench('20', 205, 5)]} locked onOpenPlus={() => (opened += 1)} onClose={() => {}} />,
      );
    });
    const rendered = json(tree);
    expect(rendered).toMatch(/23[89]/);
    expect(tree.root.findAll((n) => n.props.testID === 'lift-progress-chart')).toHaveLength(0);
    expect(rendered).not.toContain('Bench Press · 205 lb × 5');
    act(() => findButton(tree, 'See Plus')!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('says so when a lift has nothing logged', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<LiftProgressScreen profile={lifter} events={[bench('10', 185, 5)]} onClose={() => {}} />);
    });
    act(() => findButton(tree, 'Squat')!.props.onPress());
    expect(json(tree)).toContain('No squat logged yet');
    tree.unmount();
  });
});
