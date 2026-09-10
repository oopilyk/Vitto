import renderer, { act } from 'react-test-renderer';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { IDLE_STATE } from '../petWorld/types';
import type { UsePetInteractionResult } from '../petWorld/usePetInteraction';
import { TodayScreen } from '../screens/TodayScreen';
import { MindGymScreen } from '../screens/MindGymScreen';
import {
  type BodyProfile,
  DECAY_PERIOD_MS,
  DECAY_PER_DAY,
  type HealthEvent,
  type MealMetadata,
  PROFILE_SURVEY_DEFAULTS,
  applyTimeDecay,
  assessCondition,
  createPet,
  toDateKey,
} from '@vitto/core';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('../services/friendsService', () => ({
  friendsService: {
    loadFriendsOverview: jest.fn(),
    loadMyFriendRequests: jest.fn(),
    getMyUsername: jest.fn(),
    setMyUsername: jest.fn(),
    loadFriendProfile: jest.fn(),
    loadFriendPet: jest.fn(),
    loadFriendRecentActivity: jest.fn(),
    searchUsersByUsername: jest.fn(),
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
    cancelOrUnfriend: jest.fn(),
  },
}));

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

const pet = createPet('user-1', 'Miso');

/** A `DashboardScreen` in front of a pet doing nothing in particular. */
const idleInteraction: UsePetInteractionResult = {
  state: IDLE_STATE,
  notice: () => {},
  startAnalyzing: () => {},
  stopAnalyzing: () => {},
  startFeeding: () => {},
  startWorkout: () => {},
  startExploring: () => {},
  startTravel: () => {},
  setAmbientWalking: () => {},
  reset: () => {},
};

/**
 * Fourteen days of sleep and brain sessions ending yesterday: six short nights with
 * 60% accuracy, eight full nights with 80%, which is a clear signal for `calculateInsights`.
 */
const sleepMindEvents = (): HealthEvent[] => {
  const events: HealthEvent[] = [];
  for (let daysAgo = 14; daysAgo >= 1; daysAgo -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const key = toDateKey(date);
    const isShort = daysAgo > 8;
    events.push(
      {
        id: `sleep-${key}`,
        userId: 'user-1',
        occurredAt: `${key}T07:00:00`,
        type: 'SLEEP',
        source: 'healthkit',
        metadata: { asleepMinutes: isShort ? 300 : 480, night: key },
      },
      {
        id: `mind-${key}`,
        userId: 'user-1',
        occurredAt: `${key}T12:00:00`,
        type: 'BRAIN_TRAINING',
        source: 'manual',
        metadata: { game: 'math', correct: isShort ? 12 : 16, total: 20, durationSeconds: 60, score: 50 },
      },
    );
  }
  return events;
};

const mealEvent: HealthEvent<MealMetadata> = {
  id: 'meal-1',
  userId: 'user-1',
  occurredAt: new Date().toISOString(),
  type: 'MEAL',
  source: 'ai',
  metadata: {
    protein: true,
    vegetables: true,
    fruit: false,
    wholeGrains: true,
    fiber: true,
    treats: false,
    loggedVia: 'ai',
    analysis: {
      grade: 'A',
      summary: 'Balanced plate.',
      confidence: 0.9,
      foodDescription: 'Chicken, broccoli, sweet potato',
      detectedFoods: ['chicken'],
      macros: { calories: 0, proteinGrams: 38, carbsGrams: 55, fatGrams: 10 },
      nutrients: {
        protein: true,
        vegetables: true,
        fruit: false,
        wholeGrains: true,
        fiber: true,
        treats: false,
      },
    },
  },
};

describe('screens render', () => {
  it('renders the onboarding wizard', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <OnboardingScreen
        name="Miso"
        onNameChange={() => {}}
        profile={profile}
        onUpdate={() => {}}
        onAdopt={() => {}}
        breed="shiba"
        onBreedChange={() => {}}
        error={null}
      />,
      );
    });
    const labels = tree.root.findAllByType(require('react-native').Text);
    expect(labels.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('renders the dashboard with a logged meal and shows derived calories', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <TodayScreen
        pet={pet}
        events={[mealEvent]}
        profile={profile}
        stepGoal={10000}
        onStepGoalChange={() => {}}
        onTrainMind={() => {}}
        onOpenProfile={() => {}}
        onClose={() => {}}
      />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    // 38*4 + 55*4 + 10*9 = 462, the fallback for an analysis with no calories.
    expect(rendered).toContain('462');
    expect(rendered).toContain('Miso');
    tree.unmount();
  });

  it('shows a status chip for the two worst active ailments, quietly capped rather than listing every one', () => {
    // The full-bleed redesign keeps this tray to a glance (per the product
    // owner's "at most one or two" chip note) — the sprite/headline still show
    // only the single highest-precedence ailment, and the complete list is a
    // stat-sheet tap away via the level ring, so a third simultaneous ailment
    // (Foggy here) is deliberately not also crowded into the chip row.
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={{ ...pet, nutrition: 8, happiness: 8, mind: 4, energy: 80, health: 60 }}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Starving');
    expect(rendered).toContain('Lonely');
    expect(rendered).not.toContain('Foggy');

    // Right-aligned under the name card, not centred in the top row between the
    // level ring and the profile icons.
    const { StyleSheet: RNStyleSheet, Text: RNTextView } = require('react-native');
    const tray = tree.root.findAll((node: any) => {
      const style = RNStyleSheet.flatten(node.props.style);
      return Boolean(style && style.flexWrap === 'wrap' && style.justifyContent === 'flex-end');
    })[0];
    expect(tray).toBeTruthy();
    const trayLabels = tray
      .findAllByType(RNTextView)
      .map((node: any) => node.props.children)
      .join(' ');
    expect(trayLabels).toContain('Starving');
    expect(trayLabels).toContain('Lonely');
    tree.unmount();
  });

  it('confirms a logged care moment even while an ailment owns the mood line', () => {
    // The reason the toast exists: `PetWorldHud` gives the ailment precedence
    // over the reaction, so a starving pet's owner used to get no
    // acknowledgement whatsoever for logging their steps.
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={{ ...pet, nutrition: 8, happiness: 45, mind: 45, energy: 45, health: 60 }}
          events={[]}
          reaction={null}
          careToast={{ headline: '1,240 steps logged', detail: '+3 energy · +8 XP' }}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('1,240 steps logged');
    expect(rendered).toContain('+3 energy · +8 XP');
    // The ailment still owns the line it owned before.
    expect(rendered).toContain('Starving');

    // Anchored above the action row, not stacked into the top-left column with
    // the name card and the status chips.
    const { StyleSheet: RNStyleSheet, Text: RNTextView } = require('react-native');
    const slot = tree.root.findAll((node: any) => {
      const style = RNStyleSheet.flatten(node.props.style);
      return Boolean(
        style && style.position === 'absolute' && typeof style.bottom === 'number' && style.bottom > 60,
      );
    }).find((node: any) =>
      node
        .findAllByType(RNTextView)
        .some((text: any) => text.props.children === '1,240 steps logged'),
    );
    expect(slot).toBeTruthy();
    tree.unmount();
  });

  it('names the room the pet is standing in, and renames it on the way through', () => {
    const pressed: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => pressed.push('meal')}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    const findButton = (label: string) =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })
        .find((node: any) => typeof node.props.onPress === 'function');

    expect(JSON.stringify(tree.toJSON())).toContain('LIVING ROOM');

    act(() => findButton('Go to the kitchen')!.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('KITCHEN');

    act(() => findButton('Go to the study')!.props.onPress());
    const inStudy = JSON.stringify(tree.toJSON());
    expect(inStudy).toContain('STUDY');
    expect(inStudy).not.toContain('KITCHEN');

    act(() => findButton('Go outdoors')!.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('OUTDOORS');
    tree.unmount();
  });

  it('switches between your pet and the joint pet from the top of the screen', () => {
    const selected: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          pets={[
            { id: 'p', name: 'Miso', own: true },
            { id: 'q', name: 'Blue', own: false },
          ]}
          activePetId="p"
          onSelectPet={(id: string) => selected.push(id)}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('MINE');
    expect(rendered).toContain('JOINT');
    expect(rendered).toContain('Blue');

    const byLabel = (label: string) =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })
        .find((node: any) => typeof node.props.onPress === 'function');
    // The joint tab switches; the active tab is inert, like the room hotbar.
    act(() => byLabel('Show Blue, your joint pet')!.props.onPress());
    expect(selected).toEqual(['q']);
    expect(byLabel('Show Miso, your own pet')!.props.disabled).toBe(true);
    tree.unmount();
  });

  it('offers a "+" under the level ring while the joint slot is free, and not once it is taken', () => {
    let opened = 0;
    const render = (pets: { id: string; name: string; own: boolean }[]) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <DashboardScreen
            pet={pet}
            events={[]}
            reaction={null}
            pets={pets}
            activePetId={pets[0]?.id}
            onSelectPet={() => {}}
            onAddJointPet={() => {
              opened += 1;
            }}
            onLogMeal={() => {}}
            onLogWorkout={() => {}}
            onSyncSteps={() => {}}
            onTrainMind={() => {}}
            onOpenProfile={() => {}}
            onOpenStats={() => {}}
            onOpenToday={() => {}}
            interaction={idleInteraction}
          />,
        );
      });
      return tree;
    };
    const find = (tree: renderer.ReactTestRenderer, label: string) =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })
        .find((node: any) => typeof node.props.onPress === 'function');

    // One pet: the slot is a "+" that starts the join flow.
    const solo = render([{ id: 'p', name: 'Miso', own: true }]);
    const add = find(solo, 'Add a joint pet');
    expect(add).toBeTruthy();
    act(() => add!.props.onPress());
    expect(opened).toBe(1);
    // No switcher yet: the tile says "JOINT PET", but there is no tab to switch
    // to, and no MINE tab either.
    expect(find(solo, 'Show Miso, your own pet')).toBeUndefined();
    expect(JSON.stringify(solo.toJSON())).not.toContain('MINE');
    solo.unmount();

    // Two pets: the same slot is now the switcher, and the "+" is gone.
    const both = render([
      { id: 'p', name: 'Miso', own: true },
      { id: 'q', name: 'Blue', own: false },
    ]);
    expect(find(both, 'Add a joint pet')).toBeUndefined();
    expect(find(both, 'Show Blue, your joint pet')).toBeTruthy();
    both.unmount();
  });

  it('lays trophies out two to a shelf, filling the enclosed shelves before the top', () => {
    const { shelfSlots, SHELF } = require('../petWorld/TrophyShelf');

    // A lone trophy centres rather than hanging off to the left.
    expect(shelfSlots(1)).toEqual([{ plank: 0, centreX: SHELF.centreX, width: SHELF.soloWidth }]);

    // A pair splits either side of the shelf's centre line.
    const pair = shelfSlots(2);
    expect(pair.map((s: any) => s.plank)).toEqual([0, 0]);
    expect(pair[0].centreX).toBeLessThan(SHELF.centreX);
    expect(pair[1].centreX).toBeGreaterThan(SHELF.centreX);
    expect(pair[0].width).toBe(SHELF.pairWidth);

    // Three: a pair up top, the odd one centred on the shelf below.
    const three = shelfSlots(3);
    expect(three.map((s: any) => s.plank)).toEqual([0, 0, 1]);
    expect(three[2].centreX).toBe(SHELF.centreX);
    expect(three[2].width).toBe(SHELF.soloWidth);

    // Four fills both enclosed shelves; the open top of the unit is overflow.
    expect(shelfSlots(4).map((s: any) => s.plank)).toEqual([0, 0, 1, 1]);
    expect(shelfSlots(6).map((s: any) => s.plank)).toEqual([0, 0, 1, 1, 2, 2]);
    // Plank 0 and 1 are the enclosed surfaces, 2 is the top of the unit.
    expect(SHELF.plankTops[2]).toBeLessThan(SHELF.plankTops[0]);
  });

  it('puts earned trophies on the living-room shelf, and leaves it bare otherwise', () => {
    const render = (trophies: string[]) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <DashboardScreen
            pet={pet}
            events={[]}
            reaction={null}
            trophies={trophies as any}
            onLogMeal={() => {}}
            onLogWorkout={() => {}}
            onSyncSteps={() => {}}
            onTrainMind={() => {}}
            onOpenProfile={() => {}}
            onOpenStats={() => {}}
            onOpenToday={() => {}}
            interaction={idleInteraction}
          />,
        );
      });
      // The shelf lives inside the backdrop, which only draws once it has a
      // measured width; give it one.
      const backdrop = tree.root.findAll((node: any) => typeof node.props.onLayout === 'function' && node.props.style && JSON.stringify(node.props.style).includes('"position":"absolute"'))[0];
      act(() => backdrop.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } } }));
      return tree;
    };
    // Host nodes only: `findAll` also returns the composite wrapper of each
    // View, which would list every trophy twice.
    const labels = (tree: renderer.ReactTestRenderer) =>
      tree.root
        .findAll(
          (node: any) =>
            typeof node.type === 'string' &&
            node.props.accessibilityRole === 'image' &&
            typeof node.props.accessibilityLabel === 'string',
        )
        .map((node: any) => node.props.accessibilityLabel)
        .filter((label: string) => label.startsWith('Golden'));

    const bare = render([]);
    expect(labels(bare)).toEqual([]);
    bare.unmount();

    // Shelf order is fixed: shoe alone still sits on the top plank, and the
    // three come out top-to-bottom regardless of the order they were earned.
    const some = render(['drumstick', 'shoe']);
    expect(labels(some)).toEqual(['Golden shoe', 'Golden drumstick']);
    some.unmount();
  });

  it('shows nothing where the toast goes until something is logged', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('logged');
    tree.unmount();
  });

  it('shows no status chips for a pet that is neither ailing nor thriving', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={{ ...pet, nutrition: 45, happiness: 45, mind: 45, energy: 45, health: 60 }}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).not.toContain('Starving');
    expect(rendered).not.toContain('Thriving');
    expect(rendered).not.toContain('Sleepy');
    tree.unmount();
  });

  it('renders the dashboard without an insight card when there is nothing to say', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <TodayScreen
        pet={pet}
        events={[]}
        profile={profile}
        stepGoal={10000}
        onStepGoalChange={() => {}}
        onTrainMind={() => {}}
        onOpenProfile={() => {}}
        onClose={() => {}}
      />,
      );
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Miso noticed');
    tree.unmount();
  });

  it('shows what the pet noticed once the data can carry a finding', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
      <TodayScreen
        pet={pet}
        events={sleepMindEvents()}
        profile={profile}
        stepGoal={10000}
        onStepGoalChange={() => {}}
        onTrainMind={() => {}}
        onOpenProfile={() => {}}
        onClose={() => {}}
      />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Miso noticed');
    expect(rendered).toContain('Your sharper puzzle days seem to follow your longer nights.');
    expect(rendered).toContain('your mind accuracy averaged 25% lower (14 days: 6 short nights, 8 fuller)');
    tree.unmount();
  });

  it("shows only five of today's care events, with a link to the rest", () => {
    const stepEvents: HealthEvent[] = Array.from({ length: 9 }, (_, index) => ({
      id: `step-${index}`,
      userId: 'user-1',
      occurredAt: new Date().toISOString(),
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 6840 },
    })) as unknown as HealthEvent[];

    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TodayScreen
          pet={pet}
          events={stepEvents}
          profile={profile}
          stepGoal={10000}
          onStepGoalChange={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {
            opened += 1;
          }}
          onClose={() => {}}
        />,
      );
    });

    const { Text: RNText } = require('react-native');
    const rows = tree.root
      .findAllByType(RNText)
      .filter((node: any) => node.props.children === 'Went exploring');
    expect(rows).toHaveLength(5);

    const more = tree.root
      .findAll((node: any) => typeof node.props.onPress === 'function')
      .find((node: any) =>
        node
          .findAllByType(RNText)
          .some((label: any) => JSON.stringify(label.props.children).includes('more today')),
      );
    expect(more).toBeTruthy();
    // Nine events, five shown, so four are behind the link.
    expect(JSON.stringify(more!.findAllByType(RNText)[0].props.children)).toContain('4');
    act(() => more!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('opens the profile from the account button in the top bar', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {
            opened += 1;
          }}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          accountInitial="k"
          interaction={idleInteraction}
        />,
      );
    });

    const account = tree.root
      .findAllByProps({ accessibilityLabel: 'Open your profile' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(account).toBeTruthy();
    act(() => account!.props.onPress());
    expect(opened).toBe(1);
    // Shows the signed-in initial, uppercased.
    expect(JSON.stringify(tree.toJSON())).toContain('K');
    tree.unmount();
  });

  it('opens the stat sheet from the vitals HUD on the pet', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {
            opened += 1;
          }}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });

    const hud = tree.root
      .findAllByProps({ accessibilityLabel: 'Open pet stats' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(hud).toBeTruthy();
    act(() => hud!.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('keeps every log action reachable without scrolling', () => {
    const pressed: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => pressed.push('meal')}
          onLogWorkout={() => pressed.push('workout')}
          onSyncSteps={() => pressed.push('steps')}
          onTrainMind={() => pressed.push('mind')}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });

    const findButton = (label: string) =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })
        .find((node: any) => typeof node.props.onPress === 'function');

    // Nothing on the dashboard scrolls: a full-bleed environment with no boxed
    // panels, and the day's detail lives on its own page.
    const { ScrollView } = require('react-native');
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);

    // Every one of the four is a destination now, the way the Kitchen always
    // was: the button walks the pet somewhere and the scene there carries the
    // action. Study was the last one to still fire straight from the row.
    act(() => findButton('Go to the study')!.props.onPress());
    expect(pressed).toEqual([]);
    act(() => findButton('Train mind')!.props.onPress());
    expect(pressed).toEqual(['mind']);
    act(() => findButton('Back to the living room')!.props.onPress());

    // Gym: walks the pet there, and the scene carries its own "Log workout".
    act(() => findButton('Go to the gym')!.props.onPress());
    expect(pressed).toEqual(['mind']);
    act(() => findButton('Log workout')!.props.onPress());
    expect(pressed).toEqual(['mind', 'workout']);
    act(() => findButton('Back to the living room')!.props.onPress());

    // Outdoors: same shape, with "Log steps" as its call to action.
    act(() => findButton('Go outdoors')!.props.onPress());
    expect(pressed).toEqual(['mind', 'workout']);
    act(() => findButton('Log steps')!.props.onPress());
    expect(pressed).toEqual(['mind', 'workout', 'steps']);
    act(() => findButton('Back to the living room')!.props.onPress());

    // Feed doesn't call `onLogMeal` directly any more -- the Kitchen button
    // walks the pet into the Kitchen scene, which has its own dedicated
    // "Log meal" button above the pet.
    act(() => findButton('Go to the kitchen')!.props.onPress());
    expect(pressed).toEqual(['mind', 'workout', 'steps']);
    expect(findButton('Log meal')).toBeTruthy();
    // The Kitchen's leading button is now "Living room" (back to the bedroom),
    // and the old "Not right now" text link is gone.
    expect(findButton('Back to the living room')).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).not.toContain('Not right now');

    act(() => findButton('Log meal')!.props.onPress());
    expect(pressed).toEqual(['mind', 'workout', 'steps', 'meal']);

    // "Living room" returns to the bedroom, where the leading button is Kitchen again.
    act(() => findButton('Back to the living room')!.props.onPress());
    expect(findButton('Go to the kitchen')).toBeTruthy();
    tree.unmount();
  });

  it('stacks the action row above the full-screen pet tap layer so taps reach the buttons', () => {
    // Regression: the pet's "say hi" Pressable covers the whole stage. If the
    // controls layer does not sit above it, every button press lands on the pet
    // instead (broke on web when the zIndex was set one node too deep).
    const { StyleSheet } = require('react-native');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });

    const zIndexOf = (style: unknown) => (StyleSheet.flatten(style) ?? {}).zIndex ?? 0;
    const petLayer = tree.root.findByProps({ accessibilityLabel: `Say hi to ${pet.name}` });
    const petZ = zIndexOf(petLayer.props.style);

    let node: any = tree.root
      .findAllByProps({ accessibilityLabel: 'Go to the study' })
      .find((n: any) => typeof n.props.onPress === 'function');
    let controlsZ = 0;
    while (node) {
      const z = zIndexOf(node.props.style);
      if (z > petZ) {
        controlsZ = z;
        break;
      }
      node = node.parent;
    }

    expect(petZ).toBeGreaterThan(0);
    expect(controlsZ).toBeGreaterThan(petZ);
    tree.unmount();
  });

  it('stays in the Kitchen after a feed-to-celebration cycle finishes, instead of auto-returning to the bedroom', () => {
    let tree!: renderer.ReactTestRenderer;
    const render = (interaction: UsePetInteractionResult) => {
      const element = (
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={interaction}
        />
      );
      if (tree) {
        act(() => tree.update(element));
      } else {
        act(() => {
          tree = renderer.create(element);
        });
      }
    };

    render(idleInteraction);
    const findButton = (label: string) =>
      tree.root
        .findAllByProps({ accessibilityLabel: label })
        .find((node: any) => typeof node.props.onPress === 'function');

    // Walk into the Kitchen the same way a real feed tap does.
    act(() => findButton('Go to the kitchen')!.props.onPress());
    expect(findButton('Log meal')).toBeTruthy();

    // Drive the interaction prop through celebrating -> idle, the same
    // transition that used to bounce the screen back to Main (see the
    // deleted `previousKind` effect in `DashboardScreen`).
    render({ ...idleInteraction, state: { kind: 'celebrating', grade: 'A' } });
    render({ ...idleInteraction, state: { kind: 'idle' } });

    expect(findButton('Log meal')).toBeTruthy();
    tree.unmount();
  });

  it('runs a maths round in the mind gym', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MindGymScreen onFinish={async () => {}} onClose={() => {}} />);
    });

    // Find the pressable whose own subtree renders the game's name. React elements
    // hold circular fiber references, so match on the rendered text instead.
    const { Text } = require('react-native');
    const startMaths = tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) =>
        node.findAllByType(Text).some((label: any) => label.props.children === 'Quick maths'),
      );
    expect(startMaths).toBeTruthy();

    act(() => {
      startMaths!.props.onPress();
    });

    const round = JSON.stringify(tree.toJSON());
    expect(round).toContain('left');
    expect(round).toContain('streak');
    tree.unmount();
  });
});

describe('breed picker', () => {
  const { BreedPicker } = require('../components/BreedPicker');

  it('reports the breed that was tapped', () => {
    const chosen: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<BreedPicker value="bichon" onChange={(b: string) => chosen.push(b)} />);
    });

    const shiba = tree.root
      .findAllByProps({ accessibilityLabel: 'Choose the Shiba' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(shiba).toBeTruthy();
    expect(shiba!.props.accessibilityState).toEqual({ selected: false });

    act(() => shiba!.props.onPress());
    expect(chosen).toEqual(['shiba']);
    tree.unmount();
  });
});

describe('profile screen', () => {
  const { ProfileScreen } = require('../screens/ProfileScreen');

  const render = (onSave: (next: unknown) => Promise<void> = async () => {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={onSave}
          onClose={() => {}}
        />,
      );
    });
    return tree;
  };

  const findButton = (tree: renderer.ReactTestRenderer, label: string) => {
    const { Text } = require('react-native');
    return tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) => node.findAllByType(Text).some((t: any) => t.props.children === label));
  };

  it('hides the save bar until something changes, then saves', async () => {
    const saved: unknown[] = [];
    const tree = render(async (next: unknown) => {
      saved.push(next);
    });

    expect(findButton(tree, 'Save changes')).toBeUndefined();

    // Changing the goal should reveal the save bar.
    act(() => findButton(tree, 'Build muscle')!.props.onPress());
    expect(findButton(tree, 'Save changes')).toBeTruthy();

    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved).toHaveLength(1);
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
});

describe('pet stats screen', () => {
  const { PetStatsScreen } = require('../screens/PetStatsScreen');
  const { StatBar } = require('../components/StatBar');

  const render = (overrides: Record<string, unknown> = {}, onClose: () => void = () => {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetStatsScreen
          pet={{ ...pet, lastEventAt: new Date().toISOString(), ...overrides }}
          events={[mealEvent]}
          onClose={onClose}
        />,
      );
    });
    return tree;
  };

  const bars = (tree: renderer.ReactTestRenderer) =>
    new Map<string, number>(
      tree.root.findAllByType(StatBar).map((node: any) => [node.props.label, node.props.value]),
    );

  it('surfaces the stats the dashboard never shows', () => {
    const tree = render({
      energy: 57,
      nutrition: 43,
      happiness: 91,
      strength: 33,
      recovery: 27,
    });

    const shown = bars(tree);
    // None of these five appear anywhere else in the app.
    expect(shown.get('Energy')).toBe(57);
    expect(shown.get('Nutrition')).toBe(43);
    expect(shown.get('Happiness')).toBe(91);
    expect(shown.get('Strength')).toBe(33);
    expect(shown.get('Recovery')).toBe(27);

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Miso');
    expect(rendered).toContain('Condition');
    expect(rendered).toContain('Body');
    tree.unmount();
  });

  it('draws the projection it was handed, without decaying it a second time', () => {
    // Offsets are counted in decay PERIODS and losses in DECAY_PER_DAY, so this
    // holds whether a "day" is a minute of test time or an actual day. Hard-coding
    // either mode would make the test fail the moment the constant is flipped.
    const at = Date.now();
    const source = {
      ...pet,
      lastEventAt: new Date(at - 2 * DECAY_PERIOD_MS).toISOString(),
      energy: 80,
      nutrition: 60,
    };
    // App does this once and passes the result down; the screen must not repeat it.
    const projected = applyTimeDecay(source, new Date(at));
    const tree = render({ ...projected });

    const shown = bars(tree);
    expect(shown.get('Energy')).toBe(80 - 2 * DECAY_PER_DAY.energy);
    expect(shown.get('Nutrition')).toBe(60 - 2 * DECAY_PER_DAY.nutrition);
    // Exactly what it was given: a second pass would subtract the same window again.
    expect(shown.get('Energy')).toBe(projected.energy);
    expect(shown.get('Nutrition')).toBe(projected.nutrition);
    // Projecting is non-destructive — the caller's stored pet is untouched.
    expect(source.energy).toBe(80);
    expect(source.nutrition).toBe(60);
    tree.unmount();
  });

  it('warns loudly while the compressed test clock is in force', () => {
    const { IS_TEST_DECAY_PERIOD } = require('@vitto/core');
    const tree = render();
    const rendered = JSON.stringify(tree.toJSON());
    // The banner is the guard against shipping the test constant, so it has to be
    // present exactly while the constant is wrong — and gone once it is fixed.
    expect(rendered.includes('TEST MODE')).toBe(IS_TEST_DECAY_PERIOD);
    tree.unmount();
  });

  it('caps a legacy stat that was stored above the bar maximum', () => {
    const tree = render({ strength: 140, endurance: 260 });
    const shown = bars(tree);
    expect(shown.get('Strength')).toBe(100);
    expect(shown.get('Endurance')).toBe(100);
    tree.unmount();
  });

  it('goes back to the pet from the top bar', () => {
    let closed = 0;
    const tree = render({}, () => {
      closed += 1;
    });

    const back = tree.root
      .findAllByProps({ accessibilityLabel: 'Back to your pet' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(back).toBeTruthy();
    act(() => back!.props.onPress());
    expect(closed).toBe(1);
    tree.unmount();
  });
});

describe('pet sprite', () => {
  const { PetAvatar, animationFor } = require('../components/PetAvatar');
  const { sheetForPet, PET_SHEETS } = require('../components/petSprites');
  const { Image } = require('react-native');

  const spriteOffset = (overrides: Record<string, unknown>) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetAvatar
          pet={pet}
          isAnalyzingMeal={false}
          isEating={false}
          feedingImage={null}
          feedingGrade={null}
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
          {...overrides}
        />,
      );
    });
    // The sheet is the Image with a negative offset windowing one cell.
    const sheet = tree.root
      .findAllByType(Image)
      .find((node: any) => node.props.style?.marginLeft !== undefined);
    const { marginLeft, marginTop } = sheet!.props.style;
    tree.unmount();
    return { marginLeft, marginTop };
  };

  const well = assessCondition(pet);

  it('picks the band that matches what the pet is doing', () => {
    expect(animationFor('celebrating', 'content', well)).toBe('cheer');
    expect(animationFor('exploring', 'content', well)).toBe('move');
    expect(animationFor('idle', 'sleepy', well)).toBe('rest');
    expect(animationFor('idle', 'hungry', well)).toBe('idle');
  });

  it('lets what the pet is doing outrank what is wrong with it', () => {
    const starving = assessCondition({ ...pet, nutrition: 4 });
    expect(starving.primary).toBe('starving');
    // Feeding a starving dog has to show it eating, or the meal reads as wasted.
    expect(animationFor('eating', 'hungry', starving)).toBe('cheer');
    expect(animationFor('workout', 'hungry', starving)).toBe('move');
    // Idle, the ailment takes the sprite back over.
    expect(animationFor('idle', 'hungry', starving)).toBe('sad');
  });

  it('gives each ailment its own body pose, worst first', () => {
    const poseFor = (overrides: Record<string, number>) =>
      animationFor('idle', 'content', assessCondition({ ...pet, ...overrides }));

    expect(poseFor({ health: 5 })).toBe('faint');
    expect(poseFor({ energy: 8 })).toBe('rest');
    expect(poseFor({ happiness: 12 })).toBe('sad');
    expect(poseFor({ mind: 3 })).toBe('unwell');
    // Dying outranks everything else that is also true at the time.
    expect(poseFor({ health: 5, energy: 8, happiness: 12, mind: 3 })).toBe('faint');
    // And an ailment outranks the mood fallback rather than the other way round.
    expect(animationFor('idle', 'sleepy', assessCondition({ ...pet, mind: 3 }))).toBe('unwell');
  });

  it('shows the overlays the condition names, and none at all while dying', () => {
    const { DizzyOrbit, Fading, HungerPangs, RainCloud, Zzz } = require('../components/PetEffects');
    const overlayState = (overrides: Record<string, number>) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <PetAvatar
            pet={{ ...pet, ...overrides }}
            isAnalyzingMeal={false}
            isEating={false}
            feedingImage={null}
            feedingGrade={null}
            isCelebrating={false}
            isWorkingOut={false}
            isExploring={false}
          />,
        );
      });
      const state = {
        hunger: tree.root.findByType(HungerPangs).props.active,
        zzz: tree.root.findByType(Zzz).props.active,
        rain: tree.root.findByType(RainCloud).props.active,
        dizzy: tree.root.findByType(DizzyOrbit).props.active,
        fading: tree.root.findAllByType(Fading).length > 0,
      };
      tree.unmount();
      return state;
    };

    // Worst ailment takes the sprite AND keeps its own overlay, so an exhausted,
    // sad pet shows both sets of particles rather than only the lesser one's.
    expect(overlayState({ energy: 8, happiness: 12 })).toEqual({
      hunger: false,
      zzz: true,
      rain: true,
      dizzy: false,
      fading: false,
    });
    // A single ailment still gets its own particles -- the case they describe best.
    expect(overlayState({ nutrition: 4 })).toEqual({
      hunger: true,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: false,
    });
    // Dying suppresses every overlay and washes the pet out instead.
    expect(overlayState({ health: 5, nutrition: 4, energy: 8, happiness: 12, mind: 3 })).toEqual({
      hunger: false,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: true,
    });
    expect(overlayState({})).toEqual({
      hunger: false,
      zzz: false,
      rain: false,
      dizzy: false,
      fading: false,
    });
  });

  it('keeps a fainted pet down instead of standing it back up', () => {
    const { HOLDS_LAST_FRAME } = require('../components/petSprites');
    // The frame timer holds on the last cell for these; everything else loops.
    expect(HOLDS_LAST_FRAME.has('faint')).toBe(true);
    expect(HOLDS_LAST_FRAME.has('idle')).toBe(false);
  });

  it('windows a different cell of the sheet for resting than for running', () => {
    const resting = spriteOffset({ pet: { ...pet, mood: 'sleepy' } });
    const running = spriteOffset({ isExploring: true });
    expect(resting).not.toEqual(running);
    // Every frame is windowed from inside the sheet, never past its edge.
    expect(resting.marginTop).toBeLessThanOrEqual(0);
    expect(running.marginLeft).toBeLessThanOrEqual(0);
  });

  it('draws the breed the pet was given', () => {
    const { sheetForPet } = require('../components/petSprites');
    expect(sheetForPet({ id: 'any-id', breed: 'shiba' }).name).toBe('shiba');
    expect(sheetForPet({ id: 'any-id', breed: 'bichon' }).name).toBe('bichon');
  });

  it('falls back to a stable breed for pets adopted before the picker', () => {
    expect(sheetForPet({ id: 'pet-a' })).toBe(sheetForPet({ id: 'pet-a' }));
    // Enough ids to reach every breed rather than a count tied to how many there
    // happen to be — the point is that the hash spreads across all of them
    // instead of piling every unpicked pet onto the first sheet.
    const ids = Array.from({ length: 60 }, (_, index) => `pet-${index}`);
    const breeds = new Set(ids.map((id) => sheetForPet({ id }).name));
    expect(breeds.size).toBe(PET_SHEETS.length);
  });

  it('flies the meal photo in rather than parking it above the pet', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetAvatar
          pet={pet}
          isAnalyzingMeal={false}
          isEating
          feedingImage="file:///tmp/plate.jpg"
          feedingGrade="A"
          isCelebrating={false}
          isWorkingOut={false}
          isExploring={false}
        />,
      );
    });

    const food = tree.root
      .findAllByType(Image)
      .find((node: any) => node.props.source?.uri === 'file:///tmp/plate.jpg');
    expect(food).toBeTruthy();

    const style = [food!.props.style].flat().find((entry: any) => entry?.transform);
    // Animated values, not a fixed offset: it travels and shrinks into the pet.
    expect(style?.transform?.length).toBeGreaterThanOrEqual(4);
    expect([food!.props.style].flat().some((entry: any) => entry?.top !== undefined)).toBe(false);
    tree.unmount();
  });

  it('throws confetti when celebrating and hearts for a good plate', () => {
    const { Confetti, HeartStream } = require('../components/PetEffects');
    const render = (overrides: Record<string, unknown>) => {
      let tree!: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <PetAvatar
            pet={pet}
            isAnalyzingMeal={false}
            isEating={false}
            feedingImage={null}
            feedingGrade={null}
            isCelebrating={false}
            isWorkingOut={false}
            isExploring={false}
            {...overrides}
          />,
        );
      });
      const confetti = tree.root.findByType(Confetti).props.active;
      const hearts = tree.root.findByType(HeartStream).props.active;
      tree.unmount();
      return { confetti, hearts };
    };

    expect(render({})).toEqual({ confetti: false, hearts: false });
    // Confetti for any celebration; hearts only when the plate graded well.
    expect(render({ isCelebrating: true, feedingGrade: 'D' })).toEqual({
      confetti: true,
      hearts: false,
    });
    expect(render({ isCelebrating: true, feedingGrade: 'A' })).toEqual({
      confetti: true,
      hearts: true,
    });
  });

  it('sends the hearts up out of the top of the pet', () => {
    const { HeartStream } = require('../components/PetEffects');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HeartStream active headOffset={80} />);
    });

    const { Text: RNText } = require('react-native');
    const hearts = tree.root.findAllByType(RNText).filter((node: any) => node.props.children === '♥');
    expect(hearts.length).toBeGreaterThan(0);

    // `headOffset` is the top of the pet's head, so the layer must sit strictly
    // past it — an effect level with the anchor would still touch the sprite.
    const layer = tree.root.findAll((node: any) =>
      [node.props.style].flat(2).some((entry: any) => typeof entry?.marginTop === 'number' && entry.marginTop < -80),
    );
    expect(layer.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('keeps a baby on its base sheet however it has been trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runnerStats = { id: 'p', breed: 'tabbyCat', level: 5, endurance: 80, strength: 10 };
    expect(sheetForPet(runnerStats).label).toBe('Tabby Cat');
  });

  it('keeps an endurance-built pack animal on its base sheet — none has runner art', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runner = { id: 'p', breed: 'tabbyCat', level: 12, endurance: 80, strength: 10 };
    expect(sheetForPet(runner).label).toBe('Tabby Cat');
  });

  it('leaves a grown cat with no specialism on its base sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const balanced = { id: 'p', breed: 'tabbyCat', level: 40, endurance: 50, strength: 48 };
    expect(sheetForPet(balanced).label).toBe('Tabby Cat');
  });

  it('evolves a grown, endurance-built bichon onto the runner sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const runner = { id: 'p', breed: 'bichon', level: 12, endurance: 80, strength: 10 };
    expect(sheetForPet(runner).label).toBe('Bichon · Runner');
  });

  it('keeps a baby bichon on its base sheet however it has been trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const baby = { id: 'p', breed: 'bichon', level: 5, endurance: 80, strength: 10 };
    expect(sheetForPet(baby).label).toBe('Bichon');
  });

  it('gives the bichon runner its own art and its own frame map', () => {
    // The two are free to animate differently, so the maps are deliberately not
    // compared for equality — only that the evolution is a separate sheet with a
    // frame map of its own, rather than an alias of the base's.
    const { sheetForPet } = require('../components/petSprites');
    const base = sheetForPet({ id: 'p', breed: 'bichon', level: 5 });
    const runner = sheetForPet({ id: 'p', breed: 'bichon', level: 12, endurance: 80, strength: 10 });
    expect(runner.source).not.toBe(base.source);
    expect(runner.animations).not.toBe(base.animations);
  });

  it('evolves a grown, strength-built cat onto the lifter sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const lifter = { id: 'p', breed: 'tabbyCat', level: 12, strength: 80, endurance: 10, mind: 10 };
    expect(sheetForPet(lifter).label).toBe('Tabby Cat · Lifter');
  });

  it('evolves a grown, mind-built otter onto the scholar sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const scholar = { id: 'p', breed: 'otter', level: 12, mind: 80, endurance: 10, strength: 10 };
    expect(sheetForPet(scholar).label).toBe('Otter · Scholar');
  });

  it('evolves a grown, mind-built shiba onto the scholar sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const scholar = { id: 'p', breed: 'shiba', level: 12, mind: 80, endurance: 10, strength: 10 };
    expect(sheetForPet(scholar).label).toBe('Shiba · Scholar');
  });

  it('keeps a baby lifter on its base sheet however it has been trained', () => {
    const { sheetForPet } = require('../components/petSprites');
    const baby = { id: 'p', breed: 'bichon', level: 5, strength: 80, endurance: 10, mind: 10 };
    expect(sheetForPet(baby).label).toBe('Bichon');
  });

  it('gives every breed a lifter and a scholar form', () => {
    for (const sheet of PET_SHEETS as any[]) {
      expect(sheet.evolutions?.lifter?.label).toBe(`${sheet.label} · Lifter`);
      expect(sheet.evolutions?.scholar?.label).toBe(`${sheet.label} · Scholar`);
      expect(sheet.evolutions.lifter.name).toBe(sheet.name);
      expect(sheet.evolutions.scholar.name).toBe(sheet.name);
    }
  });

  it('derives the lifter and scholar sheets from the base art and frame map', () => {
    // These sheets are generated from the base art cell for cell, so their frame
    // maps must match the base's exactly — but as a copy, not the same object, so
    // a derived form can still be given a map of its own later.
    const { sheetForPet } = require('../components/petSprites');
    const base = sheetForPet({ id: 'p', breed: 'bichon', level: 5 });
    const lifter = sheetForPet({ id: 'p', breed: 'bichon', level: 12, strength: 80, endurance: 10, mind: 10 });
    const scholar = sheetForPet({ id: 'p', breed: 'bichon', level: 12, mind: 80, endurance: 10, strength: 10 });
    for (const derived of [lifter, scholar]) {
      expect(derived.source).not.toBe(base.source);
      expect(derived.animations).not.toBe(base.animations);
      expect(derived.animations).toEqual(base.animations);
    }
    expect(lifter.source).not.toBe(scholar.source);
  });

  it('keeps the otter grid shape and timings on its derived sheets', () => {
    // A 6x10 sheet read with the default 4x11 grid slices every cell wrong, so
    // the derived otters have to carry the base's shape, not just its frames.
    const { sheetForPet } = require('../components/petSprites');
    const base = sheetForPet({ id: 'p', breed: 'otter', level: 5 });
    const lifter = sheetForPet({ id: 'p', breed: 'otter', level: 12, strength: 80, endurance: 10, mind: 10 });
    const scholar = sheetForPet({ id: 'p', breed: 'otter', level: 12, mind: 80, endurance: 10, strength: 10 });
    for (const derived of [lifter, scholar]) {
      expect(derived.columns).toBe(6);
      expect(derived.rows).toBe(10);
      expect(derived.selfDrawn).toEqual(base.selfDrawn);
      expect(derived.frameMs).toEqual(base.frameMs);
      expect(derived.animations).toEqual(base.animations);
    }
  });

  it('defines every animation on every sheet, evolutions included', () => {
    // Now that each sheet carries its own map, a form can lose an animation
    // without anything else noticing until the pet renders nothing in that state.
    const animations = ['idle', 'cheer', 'move', 'rest', 'unwell', 'sad', 'faint'];
    const everySheet = PET_SHEETS.flatMap((sheet: any) => [
      sheet,
      ...Object.values(sheet.evolutions ?? {}),
    ]);
    for (const sheet of everySheet as any[]) {
      for (const name of animations) {
        expect(Array.isArray(sheet.animations[name])).toBe(true);
        expect(sheet.animations[name].length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps a build with no evolved art on the base sheet, however trained', () => {
    // The otter has lifter and scholar art but no runner, so an endurance build
    // grows up and stays exactly where it was. (This used to be the shiba's
    // case, until the shiba got runner art of its own.)
    const { sheetForPet } = require('../components/petSprites');
    const otter = { id: 'p', breed: 'otter', level: 40, endurance: 90, strength: 10, mind: 10 };
    expect(sheetForPet(otter).label).toBe('Otter');
  });

  it('sends a well-run shiba to its runner sheet', () => {
    const { sheetForPet } = require('../components/petSprites');
    const shiba = { id: 'p', breed: 'shiba', level: 40, endurance: 90, strength: 10, mind: 10 };
    expect(sheetForPet(shiba).label).toBe('Shiba · Runner');
    // Below the evolution level it is still just a shiba.
    expect(sheetForPet({ ...shiba, level: 2 }).label).toBe('Shiba');
  });

  it('only references frames that exist on the sheet', () => {
    // Evolutions included: they hang off a base sheet rather than sitting in
    // PET_SHEETS, so iterating the list alone would leave their frames unchecked.
    const everySheet = PET_SHEETS.flatMap((sheet: any) => [
      sheet,
      ...Object.values(sheet.evolutions ?? {}),
    ]);
    expect(everySheet.length).toBeGreaterThan(PET_SHEETS.length);
    for (const sheet of everySheet as any[]) {
      const maxRows = sheet.rows ?? 11;
      const maxColumns = sheet.columns ?? 4;
      for (const frames of Object.values(sheet.animations) as [number, number][][]) {
        expect(frames.length).toBeGreaterThan(0);
        for (const [row, column] of frames) {
          expect(row).toBeGreaterThanOrEqual(0);
          expect(row).toBeLessThan(maxRows);
          expect(column).toBeGreaterThanOrEqual(0);
          expect(column).toBeLessThan(maxColumns);
        }
      }
    }
  });
});

describe('care partners', () => {
  const { ProfileScreen } = require('../screens/ProfileScreen');
  const { Text: RNText, TextInput: RNTextInput } = require('react-native');
  const { CARE_LOG_LABEL, inviteExpiresAt } = require('@vitto/core');

  const owner = { userId: 'user-1', role: 'owner' as const, joinedAt: '2026-09-01T00:00:00Z', displayName: 'Kyle' };
  const alex = { userId: 'user-2', role: 'partner' as const, joinedAt: '2026-09-02T00:00:00Z', displayName: 'Alex' };
  const openInvite = {
    id: 'inv-1',
    petId: pet.id,
    code: 'ABCDEF',
    createdAt: new Date().toISOString(),
    expiresAt: inviteExpiresAt(new Date()),
  };

  const findButton = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root
      .findAll((node) => typeof node.props.onPress === 'function')
      .find((node) => node.findAllByType(RNText).some((t: any) => t.props.children === label));

  const renderProfile = (carePartner?: Record<string, unknown>) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={async () => {}}
          onClose={() => {}}
          carePartner={carePartner}
        />,
      );
    });
    return tree;
  };

  const partnerProps = (overrides: Record<string, unknown> = {}) => ({
    petName: 'Miso',
    selfUserId: 'user-1',
    // The card for YOUR pet, with the joint slot free, unless a test says otherwise.
    isOwnPet: true,
    canJoin: true,
    members: [owner],
    invite: null,
    busy: false,
    onCreateInvite: async () => {},
    onRevokeInvite: async () => {},
    onRedeemInvite: async () => true,
    onLeave: async () => {},
    ...overrides,
  });

  it('shows no care partner card at all without the prop (local mode)', () => {
    const tree = renderProfile();
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).not.toContain('Care partner');
    expect(rendered).not.toContain('Have a code?');
    tree.unmount();
  });

  it('shows the open invite code, formatted, with a way to cancel it', () => {
    const tree = renderProfile(partnerProps({ invite: openInvite }));
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('ABC-DEF');
    expect(findButton(tree, 'Cancel code')).toBeTruthy();
    expect(findButton(tree, 'New code')).toBeTruthy();
    // One live code at a time: no "invite" button while one is open.
    expect(findButton(tree, 'Invite a care partner')).toBeUndefined();
    tree.unmount();
  });

  it('offers a code when there is none, and hides the code UI once shared', () => {
    const solo = renderProfile(partnerProps());
    expect(findButton(solo, 'Invite a care partner')).toBeTruthy();
    solo.unmount();

    // Your own pet, now shared: no more invites. Joining is a separate question
    // (it is about the joint slot), so it stays until that slot is taken.
    const shared = renderProfile(partnerProps({ members: [owner, alex] }));
    expect(findButton(shared, 'Invite a care partner')).toBeUndefined();
    expect(findButton(shared, 'Have a code?')).toBeTruthy();
    shared.unmount();

    const slotTaken = renderProfile(partnerProps({ canJoin: false }));
    expect(findButton(slotTaken, 'Have a code?')).toBeUndefined();
    slotTaken.unmount();
  });

  it('normalises a typed code and hands it to onRedeemInvite', async () => {
    const redeemed: string[] = [];
    const tree = renderProfile(
      partnerProps({
        onRedeemInvite: async (code: string) => {
          redeemed.push(code);
          return true;
        },
      }),
    );

    act(() => findButton(tree, 'Have a code?')!.props.onPress());
    const input = tree.root.findAllByType(RNTextInput).find((node: any) => node.props.placeholder === 'ABC-DEF');
    expect(input).toBeTruthy();
    act(() => input!.props.onChangeText('abc-def'));
    await act(async () => {
      await findButton(tree, 'Join')!.props.onPress();
    });
    expect(redeemed).toEqual(['ABCDEF']);
    // Joined: the field is cleared.
    expect(input!.props.value).toBe('');
    tree.unmount();
  });

  it('keeps the typed code when the join confirm is cancelled', async () => {
    const tree = renderProfile(partnerProps({ onRedeemInvite: async () => false }));
    act(() => findButton(tree, 'Have a code?')!.props.onPress());
    const input = tree.root.findAllByType(RNTextInput).find((node: any) => node.props.placeholder === 'ABC-DEF');
    act(() => input!.props.onChangeText('ABC-DEF'));
    await act(async () => {
      await findButton(tree, 'Join')!.props.onPress();
    });
    expect(input!.props.value).toBe('ABC-DEF');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Could not join');
    tree.unmount();
  });

  it('shows a rejected join inline, beside the code field', async () => {
    const tree = renderProfile(
      partnerProps({
        onRedeemInvite: async () => {
          throw new Error('That code has already been used.');
        },
      }),
    );
    act(() => findButton(tree, 'Have a code?')!.props.onPress());
    const input = tree.root.findAllByType(RNTextInput).find((node: any) => node.props.placeholder === 'ABC-DEF');
    act(() => input!.props.onChangeText('ABCDEF'));
    await act(async () => {
      await findButton(tree, 'Join')!.props.onPress();
    });
    expect(JSON.stringify(tree.toJSON())).toContain('That code has already been used.');
    tree.unmount();
  });

  it('lists both carers on the joint pet and offers to leave it', async () => {
    let left = 0;
    const tree = renderProfile(
      partnerProps({
        isOwnPet: false,
        canJoin: false,
        members: [owner, alex],
        onLeave: async () => {
          left += 1;
        },
      }),
    );
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('You');
    expect(rendered).toContain('Alex');
    expect(rendered).toContain('partner');
    const leave = findButton(tree, 'Leave Miso');
    expect(leave).toBeTruthy();
    await act(async () => {
      await leave!.props.onPress();
    });
    expect(left).toBe(1);
    tree.unmount();
  });

  it('arrives with the join field open and scrolls to the care-partner card when asked', () => {
    const { ScrollView: RNScrollView } = require('react-native');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          openJoin
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={async () => {}}
          onClose={() => {}}
          carePartner={partnerProps()}
        />,
      );
    });
    // The code field is already open: no "Have a code?" step in the way.
    expect(findButton(tree, 'Have a code?')).toBeUndefined();
    expect(findButton(tree, 'Join')).toBeTruthy();

    // The card reports where it landed, and the screen scrolls there once.
    const scrollView = tree.root.findByType(RNScrollView);
    const scrollTo = jest.fn();
    (scrollView.instance as any).scrollTo = scrollTo;
    // The care-partner card is the one Card given an onLayout.
    const card = tree.root.findAll(
      (node: any) =>
        typeof node.props.onLayout === 'function' &&
        JSON.stringify(node.props.style ?? {}).includes('borderRadius'),
    )[0];
    expect(card).toBeTruthy();
    act(() => card.props.onLayout({ nativeEvent: { layout: { x: 0, y: 900, width: 0, height: 0 } } }));
    act(() => card.props.onLayout({ nativeEvent: { layout: { x: 0, y: 950, width: 0, height: 0 } } }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 888, animated: true });
    tree.unmount();
  });

  it('lists every trophy, marking the earned ones and explaining the locked ones', () => {
    const { TROPHY_IDS, TROPHY_LABEL, trophyRule } = require('@vitto/core');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={async () => {}}
          onClose={() => {}}
          trophies={['shoe']}
        />,
      );
    });
    const rendered = JSON.stringify(tree.toJSON());

    // Locked ones are listed too — the rule text is the only place the goals
    // are written down, so hiding them would leave the shelf unexplained.
    for (const id of TROPHY_IDS) {
      expect(rendered).toContain(TROPHY_LABEL[id]);
      expect(rendered).toContain(trophyRule(id, profile));
    }
    expect(rendered).toContain('1 of 4 earned');
    expect(rendered).toContain('EARNED');
    expect(rendered).toContain('LOCKED');
    tree.unmount();
  });

  it('never offers to leave your own pet, even once it is shared', () => {
    const tree = renderProfile(partnerProps({ members: [owner, alex] }));
    expect(findButton(tree, 'Leave Miso')).toBeUndefined();
    tree.unmount();
  });

  const renderReminders = (overrides: Record<string, unknown> = {}) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={async () => {}}
          onClose={() => {}}
          reminders={{
            items: [],
            permission: 'granted',
            onAdd: async () => {},
            onToggle: () => {},
            onRemove: () => {},
            ...overrides,
          }}
        />,
      );
    });
    return tree;
  };

  it('adds a reminder with the typed label and time', async () => {
    const added: any[] = [];
    const tree = renderReminders({
      onAdd: async (draft: unknown) => {
        added.push(draft);
      },
    });
    const label = tree.root
      .findAllByType(RNTextInput)
      .find((node: any) => node.props.placeholder === 'Take creatine');
    act(() => label!.props.onChangeText('Take creatine'));
    await act(async () => {
      await findButton(tree, 'Add reminder')!.props.onPress();
    });
    expect(added).toEqual([{ label: 'Take creatine', hour: 8, minute: 0, days: [] }]);
    tree.unmount();
  });

  it('refuses an empty label instead of calling onAdd', async () => {
    let calls = 0;
    const tree = renderReminders({
      onAdd: async () => {
        calls += 1;
      },
    });
    await act(async () => {
      await findButton(tree, 'Add reminder')!.props.onPress();
    });
    expect(calls).toBe(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Give the reminder a name');
    tree.unmount();
  });

  it('shows a saved reminder with its time and days, and can pause it', () => {
    let toggled = '';
    const tree = renderReminders({
      items: [
        { id: 'r-1', label: 'Take creatine', hour: 8, minute: 5, days: [], enabled: true },
        { id: 'r-2', label: 'Stretch', hour: 19, minute: 0, days: [2, 4, 6], enabled: false },
      ],
      onToggle: (id: string) => {
        toggled = id;
      },
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('8:05 am');
    expect(rendered).toContain('Every day');
    expect(rendered).toContain('7:00 pm');
    expect(rendered).toContain('Mon, Wed, Fri');
    expect(rendered).toContain('paused');
    act(() => findButton(tree, 'Pause')!.props.onPress());
    expect(toggled).toBe('r-1');
    tree.unmount();
  });

  it('says reminders will stay silent when notifications are denied', () => {
    const tree = renderReminders({ permission: 'denied' });
    expect(JSON.stringify(tree.toJSON())).toContain('Notifications are turned off');
    tree.unmount();
  });

  it('has a display-name field that rides the ordinary save bar', async () => {
    const saved: any[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ProfileScreen
          profile={profile}
          breed="shiba"
          onBreedChange={() => {}}
          events={[]}
          onSave={async (next: unknown) => {
            saved.push(next);
          }}
          onClose={() => {}}
        />,
      );
    });
    expect(findButton(tree, 'Save changes')).toBeUndefined();
    const nameInput = tree.root
      .findAllByType(RNTextInput)
      .find((node: any) => node.props.maxLength === 40);
    expect(nameInput).toBeTruthy();
    act(() => nameInput!.props.onChangeText('Kyle'));
    await act(async () => {
      await findButton(tree, 'Save changes')!.props.onPress();
    });
    expect(saved[0].displayName).toBe('Kyle');
    tree.unmount();
  });

  it("lists the partner's moments in today's care, named, and still capped at five", () => {
    const careDiary = Array.from({ length: 7 }, (_, index) => ({
      id: `log-${index}`,
      occurredAt: new Date().toISOString(),
      type: 'WORKOUT' as const,
      label: CARE_LOG_LABEL.WORKOUT,
      actorUserId: 'user-2',
      actorName: 'Alex',
    }));
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TodayScreen
          pet={pet}
          events={[]}
          profile={profile}
          stepGoal={10000}
          onStepGoalChange={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          careDiary={careDiary}
          onRefresh={async () => {}}
          onClose={() => {}}
        />,
      );
    });
    const rows = tree.root
      .findAllByType(RNText)
      .filter((node: any) => node.props.children === 'Alex · Trained together');
    expect(rows).toHaveLength(5);
    // The refresh control puts a React element in the tree's props, so match on
    // the Text nodes rather than serialising the whole render.
    const texts = tree.root.findAllByType(RNText).map((node: any) =>
      [node.props.children]
        .flat()
        .filter((child: unknown) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );
    // The link opens Profile, which lists own events only, so partner rows
    // beyond the preview are not counted as "more".
    expect(texts.some((children) => children.includes('more today'))).toBe(false);
    tree.unmount();
  });

  it('counts only own moments behind the "more" link on a shared dashboard', () => {
    const now = new Date().toISOString();
    const ownSteps: HealthEvent[] = Array.from({ length: 2 }, (_, index) => ({
      id: `own-${index}`,
      userId: 'user-1',
      occurredAt: now,
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 100 },
    })) as unknown as HealthEvent[];
    // Partner rows first, so both own rows fall past the five-row preview.
    const careDiary = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `log-${index}`,
        occurredAt: new Date(Date.now() + 1000).toISOString(),
        type: 'WORKOUT' as const,
        label: CARE_LOG_LABEL.WORKOUT,
        actorUserId: 'user-2',
        actorName: 'Alex',
      })),
      ...ownSteps.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        type: event.type,
        label: CARE_LOG_LABEL[event.type],
        actorUserId: 'user-1',
        actorName: null,
      })),
    ];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TodayScreen
          pet={pet}
          events={ownSteps}
          profile={profile}
          stepGoal={10000}
          onStepGoalChange={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          careDiary={careDiary}
          onClose={() => {}}
        />,
      );
    });
    const texts = tree.root.findAllByType(RNText).map((node: any) =>
      [node.props.children]
        .flat()
        .filter((child: unknown) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );
    // Two own rows are hidden behind the preview and are exactly what Profile lists.
    expect(texts).toContain('2 more today →');
    tree.unmount();
  });

  it('names the partner under the kicker on a shared dashboard', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
          partnerName="Alex"
        />,
      );
    });
    const { Text: RNText } = require('react-native');
    const texts = tree.root.findAllByType(RNText).map((node: any) =>
      [node.props.children]
        .flat()
        .filter((child: unknown) => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );
    expect(texts).toContain('Raised with Alex');
    tree.unmount();
  });

  it('opens the day\'s detail from the link under the pet', () => {
    let opened = 0;
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {
            opened += 1;
          }}
          interaction={idleInteraction}
        />,
      );
    });
    const link = tree.root.findAllByProps({ accessibilityLabel: "Open today's detail" })[0];
    act(() => link.props.onPress());
    expect(opened).toBe(1);
    tree.unmount();
  });

  it('keeps the solo dashboard free of any partner line', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DashboardScreen
          pet={pet}
          events={[]}
          reaction={null}
          onLogMeal={() => {}}
          onLogWorkout={() => {}}
          onSyncSteps={() => {}}
          onTrainMind={() => {}}
          onOpenProfile={() => {}}
          onOpenStats={() => {}}
          onOpenToday={() => {}}
          interaction={idleInteraction}
        />,
      );
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Raised with');
    tree.unmount();
  });

  const renderOnboardingLastStep = (onRedeemInvite?: (code: string) => Promise<boolean>) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <OnboardingScreen
          name="Miso"
          onNameChange={() => {}}
          profile={profile}
          onUpdate={() => {}}
          onAdopt={() => {}}
          breed="shiba"
          onBreedChange={() => {}}
          error={null}
          onRedeemInvite={onRedeemInvite}
        />,
      );
    });
    // Three "Continue"s reach the last step; the test profile passes every check.
    for (let step = 0; step < 3; step += 1) {
      act(() => findButton(tree, 'Continue')!.props.onPress());
    }
    expect(findButton(tree, 'Adopt Miso')).toBeTruthy();
    return tree;
  };

  it('offers to join a partner instead of adopting, only when signed in online', async () => {
    const redeemed: string[] = [];
    const tree = renderOnboardingLastStep(async (code) => {
      redeemed.push(code);
      return true;
    });
    const reveal = findButton(tree, "Got an invite code? Join a partner's pet instead");
    expect(reveal).toBeTruthy();
    act(() => reveal!.props.onPress());
    const input = tree.root.findAllByType(RNTextInput).find((node: any) => node.props.placeholder === 'ABC-DEF');
    expect(input).toBeTruthy();
    act(() => input!.props.onChangeText('abc def'));
    await act(async () => {
      await findButton(tree, 'Join')!.props.onPress();
    });
    expect(redeemed).toEqual(['ABCDEF']);
    tree.unmount();

    const offline = renderOnboardingLastStep();
    expect(findButton(offline, "Got an invite code? Join a partner's pet instead")).toBeUndefined();
    offline.unmount();
  });
});

describe('friends screen', () => {
  const { FriendsScreen } = require('../screens/FriendsScreen');
  const { friendsService } = require('../services/friendsService');

  const overviewFriend = (over: Record<string, unknown> = {}) => ({
    friendId: 'user-2',
    profile: { id: 'user-2', username: 'friend_two', displayName: 'Friend Two' },
    pet: createPet('user-2', 'Blue'),
    lastActivity: null,
    friendsSince: '2026-01-02T00:00:00.000Z',
    ...over,
  });

  const openAddPanel = (tree: renderer.ReactTestRenderer) => {
    const toggle = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Add a friend' && typeof node.props.onPress === 'function',
    )[0];
    act(() => toggle.props.onPress());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    friendsService.loadFriendsOverview.mockResolvedValue([]);
    friendsService.loadMyFriendRequests.mockResolvedValue([]);
    friendsService.getMyUsername.mockResolvedValue(null);
  });

  it('shows the empty state and the username gate for a user with no username yet', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    // Empty friends list is called out in place...
    expect(JSON.stringify(tree.toJSON())).toContain('No friends yet');
    // ...and search stays gated behind choosing a username, inside the +
    // panel, which is closed by default.
    expect(JSON.stringify(tree.toJSON())).not.toContain('Search a username');

    openAddPanel(tree);
    expect(JSON.stringify(tree.toJSON())).toContain('Save username');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Search a username');
    tree.unmount();
  });

  it('lists an accepted friend by their pet-avatar row, and taps through to their pet', async () => {
    friendsService.loadFriendsOverview.mockResolvedValue([overviewFriend()]);
    friendsService.getMyUsername.mockResolvedValue('me');

    const opened: Array<[string, string[]]> = [];
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen
          currentUserId="user-1"
          onClose={() => {}}
          onOpenFriendPet={(id: string, ids: string[]) => opened.push([id, ids])}
        />,
      );
    });

    expect(JSON.stringify(tree.toJSON())).toContain('Friend Two');

    const row = tree.root.findAll(
      (node: any) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith("Open Friend Two's pet") &&
        typeof node.props.onPress === 'function',
    )[0];
    expect(row).toBeTruthy();
    act(() => row.props.onPress());
    // Hands over the full ordered accepted-friends list, not just the one tapped.
    expect(opened).toEqual([['user-2', ['user-2']]]);
    tree.unmount();
  });

  it('shows a null-pet friend with a "No pet yet" status line', async () => {
    friendsService.loadFriendsOverview.mockResolvedValue([overviewFriend({ pet: null })]);
    friendsService.getMyUsername.mockResolvedValue('me');

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Friend Two');
    expect(rendered).toContain('No pet yet');
    tree.unmount();
  });

  it('shows the derived health/place status line for a friend with a pet', async () => {
    friendsService.loadFriendsOverview.mockResolvedValue([
      overviewFriend({
        pet: createPet('user-2', 'Blue'),
        lastActivity: { type: 'WORKOUT', occurredAt: new Date().toISOString() },
      }),
    ]);
    friendsService.getMyUsername.mockResolvedValue('me');

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    // A live WORKOUT signal puts the pet "At the gym" (see deriveSocialPetStatus).
    expect(JSON.stringify(tree.toJSON())).toContain('At the gym');
    tree.unmount();
  });

  it('shows an incoming request banner with accept/decline actions', async () => {
    friendsService.loadMyFriendRequests.mockResolvedValue([
      {
        id: 'r1',
        requesterId: 'user-2',
        addresseeId: 'user-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    friendsService.getMyUsername.mockResolvedValue('me');
    friendsService.loadFriendProfile.mockResolvedValue({
      id: 'user-2',
      username: 'friend_two',
      displayName: null,
    });

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('wants to be friends');
    // No display name set, so it falls back to the @username.
    expect(rendered).toContain('@friend_two');
    expect(rendered).toContain('Accept');
    expect(rendered).toContain('Decline');

    const decline = tree.root.findAll(
      (node: any) => typeof node.props.onPress === 'function',
    ).find((node: any) =>
      node.findAllByType(require('react-native').Text).some((t: any) => t.props.children === 'Decline'),
    );
    act(() => decline!.props.onPress());
    expect(friendsService.declineFriendRequest).toHaveBeenCalledWith('r1');
    tree.unmount();
  });

  it('shows "no one found" for a search with no results', async () => {
    friendsService.getMyUsername.mockResolvedValue('me');
    friendsService.searchUsersByUsername.mockResolvedValue([]);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    openAddPanel(tree);

    const { TextInput } = require('react-native');
    const searchInput = tree.root
      .findAllByType(TextInput)
      .find((node: any) => node.props.placeholder === 'Search a username');
    expect(searchInput).toBeTruthy();

    jest.useFakeTimers();
    act(() => {
      searchInput!.props.onChangeText('nobody');
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(friendsService.searchUsersByUsername).toHaveBeenCalledWith('nobody');
    expect(JSON.stringify(tree.toJSON())).toContain('No one found with that username.');
    tree.unmount();
  });

  it('does not show "Add" for a search result who is already a friend or has a pending request', async () => {
    friendsService.loadFriendsOverview.mockResolvedValue([overviewFriend()]);
    friendsService.loadMyFriendRequests.mockResolvedValue([
      {
        id: 'r1',
        requesterId: 'user-1',
        addresseeId: 'user-2',
        status: 'accepted',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    friendsService.getMyUsername.mockResolvedValue('me');
    friendsService.searchUsersByUsername.mockResolvedValue([
      { id: 'user-2', username: 'friend_two', displayName: 'Friend Two' },
    ]);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendsScreen currentUserId="user-1" onClose={() => {}} onOpenFriendPet={() => {}} />,
      );
    });

    openAddPanel(tree);

    const { TextInput } = require('react-native');
    const searchInput = tree.root
      .findAllByType(TextInput)
      .find((node: any) => node.props.placeholder === 'Search a username');

    jest.useFakeTimers();
    act(() => {
      searchInput!.props.onChangeText('friend');
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const { Text: RNText } = require('react-native');
    const addButtons = tree.root
      .findAll((node: any) => typeof node.props.onPress === 'function')
      .filter((node: any) => node.findAllByType(RNText).some((t: any) => t.props.children === 'Add'));
    // Already an accepted friend -- the search result must show status text
    // ("Friends"), never an actionable "Add" button.
    expect(addButtons.length).toBe(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Friends');
    tree.unmount();
  });
});


describe('friend pet screen', () => {
  const { FriendPetScreen } = require('../screens/FriendPetScreen');
  const { friendsService } = require('../services/friendsService');
  const { PetAvatar } = require('../components/PetAvatar');

  const friendTwoProfile = { id: 'user-2', username: 'friend_two', displayName: 'Friend Two' };
  const friendThreeProfile = { id: 'user-3', username: 'friend_three', displayName: 'Friend Three' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const findByAccessibilityLabel = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root.findAll((node: any) => node.props.accessibilityLabel === label)[0];

  it("shows a friendly message when the friend hasn't adopted a pet yet", async () => {
    friendsService.loadFriendPet.mockResolvedValue(null);
    friendsService.loadFriendProfile.mockResolvedValue(friendTwoProfile);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={['user-2']} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain("hasn't adopted a pet yet");
    tree.unmount();
  });

  it('treats a friendship that has just been revoked as "not connected", not an error', async () => {
    friendsService.loadFriendPet.mockResolvedValue(null);
    friendsService.loadFriendProfile.mockResolvedValue(null);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={['user-2']} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    expect(JSON.stringify(tree.toJSON())).toContain("not connected anymore");
    tree.unmount();
  });

  it('lights up the matching PetAvatar pose for a live activity signal', async () => {
    friendsService.loadFriendPet.mockResolvedValue(pet);
    friendsService.loadFriendProfile.mockResolvedValue(friendTwoProfile);
    friendsService.loadFriendRecentActivity.mockResolvedValue([
      { type: 'WORKOUT', occurredAt: new Date().toISOString() },
    ]);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={['user-2']} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    const avatar = tree.root.findByType(PetAvatar);
    expect(avatar.props.pet).toBe(pet);
    expect(avatar.props.isWorkingOut).toBe(true);
    expect(avatar.props.isEating).toBe(false);
    expect(avatar.props.isExploring).toBe(false);
    // Never any children -- that is what keeps this view genuinely read-only,
    // since every feed/train affordance on the dashboard is passed as PetAvatar's
    // `children` rather than living inside the component.
    expect(avatar.props.children).toBeUndefined();
    expect(JSON.stringify(tree.toJSON())).toContain('Working out');
    tree.unmount();
  });

  it('never poses a recent-but-not-live activity as if it were happening right now', async () => {
    friendsService.loadFriendPet.mockResolvedValue(pet);
    friendsService.loadFriendProfile.mockResolvedValue(friendTwoProfile);
    friendsService.loadFriendRecentActivity.mockResolvedValue([
      { type: 'WORKOUT', occurredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    ]);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={['user-2']} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    const avatar = tree.root.findByType(PetAvatar);
    // A three-hour-old signal is "recently active" but never live -- none of
    // the pose flags may be set from it.
    expect(avatar.props.isWorkingOut).toBe(false);
    expect(avatar.props.isEating).toBe(false);
    expect(avatar.props.isExploring).toBe(false);
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Worked out earlier');
    expect(rendered).toContain('3h ago');
    tree.unmount();
  });

  it('still renders the pet when the recent-activity fetch fails, falling back to no signals', async () => {
    friendsService.loadFriendPet.mockResolvedValue(pet);
    friendsService.loadFriendProfile.mockResolvedValue(friendTwoProfile);
    friendsService.loadFriendRecentActivity.mockRejectedValue(new Error('RPC unavailable'));

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={['user-2']} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    // The pet still renders, read-only, exactly as if there were simply no
    // recent activity -- one flaky RPC must never take the whole card down.
    const avatar = tree.root.findByType(PetAvatar);
    expect(avatar.props.pet).toBe(pet);
    expect(avatar.props.isWorkingOut).toBe(false);
    expect(avatar.props.isEating).toBe(false);
    expect(avatar.props.isExploring).toBe(false);
    expect(JSON.stringify(tree.toJSON())).toContain('Quiet lately');
    tree.unmount();
  });

  it('moves between friends with Next/Prev, re-fetching each one, and disables at the ends', async () => {
    friendsService.loadFriendPet.mockImplementation((id: string) =>
      Promise.resolve(id === 'user-2' ? pet : { ...pet, name: 'Riko' }),
    );
    friendsService.loadFriendProfile.mockImplementation((id: string) =>
      Promise.resolve(id === 'user-2' ? friendTwoProfile : friendThreeProfile),
    );
    friendsService.loadFriendRecentActivity.mockResolvedValue([]);

    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen
          friendUserIds={['user-2', 'user-3']}
          initialFriendUserId="user-2"
          onClose={() => {}}
        />,
      );
    });

    expect(JSON.stringify(tree.toJSON())).toContain('Friend Two');
    expect(friendsService.loadFriendPet).toHaveBeenCalledWith('user-2');

    // Prev is disabled/hidden at the first friend.
    const prev = findByAccessibilityLabel(tree, 'Previous friend');
    expect(prev.props.disabled).toBe(true);
    const next = findByAccessibilityLabel(tree, 'Next friend');
    expect(next.props.disabled).toBe(false);

    await act(async () => {
      next.props.onPress();
      // `onPress` itself is synchronous; flush the microtasks the resulting
      // effect's promise chain (loadFriendPet/loadFriendProfile/loadFriendRecentActivity)
      // schedules, same technique the debounced-search test above uses.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(friendsService.loadFriendPet).toHaveBeenCalledWith('user-3');
    expect(JSON.stringify(tree.toJSON())).toContain('Friend Three');

    // Next is disabled/hidden at the last friend; Prev is now enabled.
    const prevAfter = findByAccessibilityLabel(tree, 'Previous friend');
    const nextAfter = findByAccessibilityLabel(tree, 'Next friend');
    expect(prevAfter.props.disabled).toBe(false);
    expect(nextAfter.props.disabled).toBe(true);

    await act(async () => {
      prevAfter.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(JSON.stringify(tree.toJSON())).toContain('Friend Two');
    tree.unmount();
  });

  it('shows a sensible message instead of crashing for an empty friend list', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <FriendPetScreen friendUserIds={[]} initialFriendUserId="user-2" onClose={() => {}} />,
      );
    });

    expect(JSON.stringify(tree.toJSON())).toContain('No friends to browse');
    expect(friendsService.loadFriendPet).not.toHaveBeenCalled();
    tree.unmount();
  });
});
