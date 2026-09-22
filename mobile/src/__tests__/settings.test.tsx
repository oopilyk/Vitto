import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { type BodyProfile, PROFILE_SURVEY_DEFAULTS, measurementSystemOf } from '@vitto/core';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

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
    tree = renderer.create(<SettingsScreen profile={body} onSave={onSave} onClose={onClose} />);
  });
  return tree;
};

describe('settings screen', () => {
  it('shows the body profile cards that used to live on Profile', () => {
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

  it('lets you change the companion, saved straight away outside the draft', () => {
    const chosen: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsScreen
          profile={profile}
          breed="bichon"
          onBreedChange={(next) => chosen.push(next)}
          onSave={async () => {}}
          onClose={() => {}}
        />,
      );
    });
    expect(json(tree)).toContain('Your companion');
    act(() => byLabel(tree, 'Choose the Shiba')!.props.onPress());
    expect(chosen).toEqual(['shiba']);
    // Not part of the profile draft, so no save bar appears.
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    tree.unmount();
  });

  it('hides the companion card when no breed handler is wired up', () => {
    expect(json(render())).not.toContain('Your companion');
  });

  it('offers Delete account at the bottom, and says what it destroys', async () => {
    let deleted = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsScreen
          profile={profile}
          onSave={async () => {}}
          onClose={() => {}}
          onDeleteAccount={async () => {
            deleted += 1;
          }}
        />,
      );
    });
    const rendered = json(tree);
    expect(rendered).toContain('Delete account');
    // The warning has to name the shared-pet outcome, which is the surprising part.
    expect(rendered).toContain('cannot be undone');
    expect(rendered).toContain('care partner');

    await act(async () => {
      await findButton(tree, 'Delete account')!.props.onPress();
    });
    expect(deleted).toBe(1);
    tree.unmount();
  });

  it('hides Delete account offline, where there is no account to delete', () => {
    const tree = render();
    expect(json(tree)).not.toContain('Delete account');
    tree.unmount();
  });

  it('goes back to Profile from the top bar', () => {
    let closed = 0;
    const tree = render(profile, async () => {}, () => {
      closed += 1;
    });
    act(() => findButton(tree, 'Profile')!.props.onPress());
    expect(closed).toBe(1);
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
          onSave={async () => {}}
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

describe('SettingsScreen personality', () => {
  it('edits base, sliders and notes together, saving once', () => {
    const saved: unknown[] = [];
    const pet = { name: 'Blue', personality: 'sweet' as const, dials: undefined, persona: undefined };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SettingsScreen profile={profile} onSave={async () => {}} onClose={() => {}} breed="bichon" onBreedChange={() => {}} pet={pet} onCharacterChange={(next) => saved.push(next)} />,
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
    act(() => save().props.onPress());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ personality: 'savage', dials: { blunt: 0, sarcastic: 0.92 }, persona: '' });
  });

  it('keeps the editor off the screen when there is no pet to edit', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<SettingsScreen profile={profile} onSave={async () => {}} onClose={() => {}} />); });
    expect(tree.root.findAll((n) => n.props.testID === 'character-dials')).toHaveLength(0);
  });
});
