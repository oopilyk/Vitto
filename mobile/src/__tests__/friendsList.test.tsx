import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { createPet, type FriendOverview } from '@vitto/core';
import { PetWorldHud } from '../petWorld/PetWorldHud';
import { FriendListRow } from '../components/FriendListRow';
import { PetSpriteAvatar } from '../components/PetSpriteAvatar';
import { FRIENDS_DARK, FRIENDS_LIGHT } from '../friendsTheme';

const pet = createPet('user-1', 'Miso');

const findByAccessibilityLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => node.props.accessibilityLabel === label);

const renderHud = (props: Partial<React.ComponentProps<typeof PetWorldHud>>) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PetWorldHud
        pet={pet}
        events={[]}
        reaction={null}
        environment="main"
        formLabel="Level 1"
        onOpenProfile={() => {}}
        onOpenStats={() => {}}
        onOpenToday={() => {}}
        {...props}
      />,
    );
  });
  return tree;
};

/** The friends row lives in the account menu, so the disc has to be opened first. */
const openMenu = (tree: renderer.ReactTestRenderer) => {
  const [disc] = findByAccessibilityLabel(tree, 'Open account menu').filter(
    (node: any) => typeof node.props.onPress === 'function',
  );
  act(() => disc.props.onPress());
};

const pressable = (nodes: any[]) => nodes.filter((node: any) => typeof node.props.onPress === 'function');

describe('PetWorldHud account menu', () => {
  it('has no friends button on the rail and no friends row without a handler', () => {
    const tree = renderHud({});
    expect(findByAccessibilityLabel(tree, 'Open friends')).toHaveLength(0);
    openMenu(tree);
    expect(pressable(findByAccessibilityLabel(tree, 'Open profile'))).toHaveLength(1);
    expect(findByAccessibilityLabel(tree, 'Open friends')).toHaveLength(0);
    expect(findByAccessibilityLabel(tree, 'Open settings')).toHaveLength(0);
    tree.unmount();
  });

  it('lists Profile, Settings and Friends and fires the handler chosen', () => {
    const opened = jest.fn();
    const settings = jest.fn();
    const tree = renderHud({ onOpenFriends: opened, onOpenSettings: settings });
    openMenu(tree);
    expect(pressable(findByAccessibilityLabel(tree, 'Open settings'))).toHaveLength(1);
    const [friends] = pressable(findByAccessibilityLabel(tree, 'Open friends'));
    expect(friends).toBeTruthy();
    act(() => friends.props.onPress());
    expect(opened).toHaveBeenCalledTimes(1);
    expect(settings).not.toHaveBeenCalled();
    // Choosing closes the menu.
    expect(findByAccessibilityLabel(tree, 'Open friends')).toHaveLength(0);
    tree.unmount();
  });

  it('closes when the scene behind it is tapped', () => {
    const tree = renderHud({ onOpenFriends: () => {} });
    openMenu(tree);
    const [backdrop] = pressable(findByAccessibilityLabel(tree, 'Close account menu'));
    act(() => backdrop.props.onPress());
    expect(findByAccessibilityLabel(tree, 'Open friends')).toHaveLength(0);
    expect(findByAccessibilityLabel(tree, 'Close account menu')).toHaveLength(0);
    tree.unmount();
  });

  it('takes a dark chrome variant at night', () => {
    const dayTree = renderHud({});
    const nightTree = renderHud({ night: true });
    const [dayDisc] = pressable(findByAccessibilityLabel(dayTree, 'Open account menu'));
    const [nightDisc] = pressable(findByAccessibilityLabel(nightTree, 'Open account menu'));

    const flatten = (style: unknown) =>
      Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
    // The night variant paints a different panel background than the day one.
    expect(flatten(dayDisc.props.style({ pressed: false })).backgroundColor).not.toBe(
      flatten(nightDisc.props.style({ pressed: false })).backgroundColor,
    );
  });
});

describe('FriendListRow', () => {
  const baseFriend: FriendOverview = {
    friendId: 'user-2',
    profile: { id: 'user-2', username: 'friend_two', displayName: 'Friend Two' },
    pet: createPet('user-2', 'Blue'),
    lastActivity: null,
    friendsSince: '2026-01-02T00:00:00.000Z',
  };

  it('renders a pet-sprite avatar and a health/place status subline', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FriendListRow friend={baseFriend} palette={FRIENDS_LIGHT} onPress={() => {}} />,
      );
    });

    // The avatar renders the friend's actual pet.
    const avatar = tree.root.findByType(PetSpriteAvatar);
    expect(avatar.props.pet).toBe(baseFriend.pet);

    const rendered = JSON.stringify(tree.toJSON());
    // Named by handle, like everywhere else a person appears.
    expect(rendered).toContain('@friend_two');
    expect(rendered).not.toContain('Friend Two');
    // A fresh pet with no recent activity reads as "At home".
    expect(rendered).toContain('At home');
    tree.unmount();
  });

  it('shows a placeholder avatar and "No pet yet" when the friend has no pet', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FriendListRow
          friend={{ ...baseFriend, pet: null }}
          palette={FRIENDS_DARK}
          onPress={() => {}}
        />,
      );
    });

    const avatar = tree.root.findByType(PetSpriteAvatar);
    expect(avatar.props.pet).toBeNull();
    expect(avatar.props.placeholderInitial).toBe('F');
    expect(JSON.stringify(tree.toJSON())).toContain('No pet yet');
    tree.unmount();
  });

  it('fires onPress with the row as the whole tap target', () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FriendListRow friend={baseFriend} palette={FRIENDS_LIGHT} onPress={onPress} />,
      );
    });
    const [row] = tree.root.findAll(
      (node: any) => node.props.accessibilityLabel === "Open @friend_two's pet",
    );
    act(() => row.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});

describe('PetSpriteAvatar', () => {
  it('renders the initial letter for a null pet', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <PetSpriteAvatar pet={null} placeholderInitial="a" backgroundColor="#eee" />,
      );
    });
    const texts = tree.root.findAllByType(Text);
    expect(texts.some((t) => t.props.children === 'A')).toBe(true);
    tree.unmount();
  });
});
