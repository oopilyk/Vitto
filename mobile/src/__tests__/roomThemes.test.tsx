import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { RoomTheme } from '@vitto/core';
import { ChooseCompanionScreen } from '../screens/ChooseCompanionScreen';
import { kitchenEnvironment } from '../petWorld/KitchenEnvironment';
import { mainEnvironment } from '../petWorld/MainEnvironment';
import { gymEnvironment } from '../petWorld/GymEnvironment';
import { studyEnvironment } from '../petWorld/StudyEnvironment';
import { outsideEnvironment } from '../petWorld/OutsideEnvironment';

describe('room art', () => {
  const art = (dressing: { background: unknown }) => (dressing.background as { props: { source: unknown } }).props.source;
  const rooms = [
    (theme: RoomTheme) => mainEnvironment({ theme }),
    (theme: RoomTheme) => kitchenEnvironment({ onChooseFood: () => {}, theme }),
    (theme: RoomTheme) => gymEnvironment({ onStartWorkout: () => {}, theme }),
    (theme: RoomTheme) => studyEnvironment({ onTrainMind: () => {}, theme }),
    (theme: RoomTheme) => outsideEnvironment({ onLogRun: () => {}, theme }),
  ];

  it('draws every room from its own art under every theme', () => {
    const { ROOM_THEMES } = require('@vitto/core');
    const seen = new Set<unknown>();
    for (const theme of ROOM_THEMES as RoomTheme[]) {
      for (const room of rooms) {
        const source = art(room(theme));
        expect(source).toBeDefined();
        expect(seen.has(source)).toBe(false);
        seen.add(source);
        if (theme !== 'classic') expect(room(theme).backgroundColor).not.toBe(room('classic').backgroundColor);
      }
    }
  });

  it('zooms the close-up rooms out, and leaves the living rooms and other themes alone', () => {
    const props = (dressing: { background: unknown }) =>
      (dressing.background as { props: { maxScale?: number; fill?: boolean } }).props;
    for (const room of rooms.slice(1)) {
      for (const theme of ['elf', 'reef', 'mountain', 'desert', 'cyber'] as RoomTheme[]) expect(props(room(theme)).maxScale).toBe(1);
      for (const theme of ['space', 'cloud', 'candy'] as RoomTheme[]) expect(props(room(theme)).maxScale).toBeUndefined();
    }
    expect(props(rooms[4]('elf')).fill).toBe(false);
    expect(props(rooms[4]('space')).fill).toBe(true);
    expect(props(rooms[0]('elf')).maxScale).toBeUndefined();
  });

  it('keeps the classic art when no theme is given', () => {
    expect(art(kitchenEnvironment({ onChooseFood: () => {} }))).toBe(art(rooms[1]('classic')));
  });
});

describe('trophy shelves', () => {
  // Each themed shelf's posts, in art pixels (971 wide), as measured.
  const POSTS: Record<string, [number, number]> = {
    space: [122, 265],
    cloud: [138, 372],
    elf: [155, 325],
    reef: [130, 350],
    mountain: [125, 335],
    candy: [135, 335],
    desert: [155, 345],
    cyber: [132, 315],
  };

  // Redrawn so the shelf sits clear of the left edge: the tall-phone zoom crops
  // a twelfth (1 - 1/1.2, halved) off each side, and the frame must survive it.
  it('keeps every themed shelf clear of what the zoom crops off the left edge', () => {
    for (const [left] of Object.values(POSTS)) expect(left / 971).toBeGreaterThan((1 - 1 / 1.2) / 2 + 0.03);
  });

  it('gives every theme a shelf, with all four trophies inside its posts and none overlapping', () => {
    const { THEME_SHELVES, shelfSlots } = require('../petWorld/TrophyShelf');
    expect(Object.keys(THEME_SHELVES).sort()).toEqual(Object.keys(POSTS).sort());
    for (const [theme, [left, right]] of Object.entries(POSTS)) {
      const slots = shelfSlots(4, THEME_SHELVES[theme]);
      for (const slot of slots) {
        expect(slot.centreX - slot.width / 2).toBeGreaterThanOrEqual(left / 971);
        expect(slot.centreX + slot.width / 2).toBeLessThanOrEqual(right / 971);
      }
      const places = slots.map((slot: { plank: number; centreX: number }) => `${slot.plank}:${slot.centreX}`);
      expect(new Set(places).size).toBe(4);
    }
  });
});

describe('the shop’s Rooms tab', () => {
  const render = (coins: number, chosen: RoomTheme[], owned: RoomTheme[] = ['classic'], cost = 300) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ChooseCompanionScreen
          breed="bichon"
          coins={coins}
          cost={500}
          onChoose={() => {}}
          onClose={() => {}}
          roomTheme="classic"
          ownedRoomThemes={owned}
          roomThemeCost={cost}
          onChooseRoomTheme={(theme) => chosen.push(theme)}
        />,
      );
    });
    return tree;
  };
  const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));
  const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
    tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAllByType(Text).some((t) => t.props.children === label))[0]!;
  const card = (tree: renderer.ReactTestRenderer, theme: RoomTheme) =>
    tree.root.findAll((n) => n.props.testID === `room-theme-${theme}` && typeof n.props.onPress === 'function')[0]!;
  const openRooms = (tree: renderer.ReactTestRenderer) => act(() => pressable(tree, 'Rooms').props.onPress());

  it('opens on the animals, with the rooms a tab away', () => {
    const tree = render(400, []);
    expect(tree.root.findAll((n) => n.props.testID === 'room-theme-space')).toHaveLength(0);
    openRooms(tree);
    expect(card(tree, 'space')).toBeDefined();
    expect(texts(tree)).toContain('New rooms');
    expect(texts(tree)).toContain('300 coins');
    tree.unmount();
  });

  it('asks before spending, then buys', () => {
    const chosen: RoomTheme[] = [];
    const tree = render(400, chosen);
    openRooms(tree);
    act(() => card(tree, 'space').props.onPress());
    expect(chosen).toEqual([]);
    expect(texts(tree).some((t) => t.includes("You'll have 100 left"))).toBe(true);
    act(() => pressable(tree, 'Move in · 300 coins').props.onPress());
    expect(chosen).toEqual(['space']);
    tree.unmount();
  });

  it('greys out rooms it cannot afford', () => {
    const chosen: RoomTheme[] = [];
    const tree = render(120, chosen);
    openRooms(tree);
    expect(card(tree, 'space').props.disabled).toBe(true);
    expect(texts(tree)).toContain('You need 180 more coins for new rooms. You earn 50 for every level-up.');
    tree.unmount();
  });

  it('switches to rooms it owns at once, for free', () => {
    const chosen: RoomTheme[] = [];
    const tree = render(0, chosen, ['classic', 'space']);
    openRooms(tree);
    expect(card(tree, 'space').props.disabled).toBe(false);
    act(() => card(tree, 'space').props.onPress());
    expect(chosen).toEqual(['space']);
    tree.unmount();
  });
});
