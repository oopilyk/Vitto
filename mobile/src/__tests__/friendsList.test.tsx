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

describe('PetWorldHud friends button', () => {
  it('is hidden when no onOpenFriends handler is passed', () => {
    const tree = renderHud({});
    expect(findByAccessibilityLabel(tree, 'Open friends')).toHaveLength(0);
    tree.unmount();
  });

  it('is shown and fires onOpenFriends when the handler is passed', () => {
    const opened = jest.fn();
    const tree = renderHud({ onOpenFriends: opened });
    const [button] = findByAccessibilityLabel(tree, 'Open friends');
    expect(button).toBeTruthy();
    act(() => button.props.onPress());
    expect(opened).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('takes a dark chrome variant at night', () => {
    const dayButton = findByAccessibilityLabel(renderHud({ onOpenFriends: () => {} }), 'Open friends')[0];
    const nightButton = findByAccessibilityLabel(
      renderHud({ onOpenFriends: () => {}, night: true }),
      'Open friends',
    )[0];

    const flatten = (style: unknown) =>
      Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
    // The night variant paints a different pill background than the day one.
    expect(flatten(dayButton.props.style({ pressed: false })).backgroundColor).not.toBe(
      flatten(nightButton.props.style({ pressed: false })).backgroundColor,
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
    expect(rendered).toContain('Friend Two');
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
      (node: any) => node.props.accessibilityLabel === "Open Friend Two's pet",
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
