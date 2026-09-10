import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type FriendOverview, deriveSocialPetStatus } from '@vitto/core';
import { PetSpriteAvatar } from './PetSpriteAvatar';
import { type FriendsPalette, healthToneColor } from '../friendsTheme';
import { fonts } from '../theme';

interface Props {
  friend: FriendOverview;
  palette: FriendsPalette;
  onPress: () => void;
}

const AVATAR_SIZE = 48;

const rowName = (friend: FriendOverview): string => {
  const { displayName, username } = friend.profile;
  return displayName || (username ? `@${username}` : friend.friendId);
};

/**
 * One friend in the Snapchat-style list: pet-sprite avatar, name, and a derived
 * status subline ("Thriving · At the gym"), the health half coloured by tone.
 * The whole row is the tap target -- it opens that friend's pet detail.
 */
export function FriendListRow({ friend, palette, onPress }: Props) {
  // `deriveSocialPetStatus` treats an empty signal list as "quiet lately", so a
  // pet with no recent activity still gets a sensible place/health read.
  const status = friend.pet
    ? deriveSocialPetStatus(friend.pet, friend.lastActivity ? [friend.lastActivity] : [])
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${rowName(friend)}'s pet`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.rowBg, borderColor: palette.divider },
        pressed && styles.pressed,
      ]}
    >
      <PetSpriteAvatar
        pet={friend.pet}
        size={AVATAR_SIZE}
        placeholderInitial={rowName(friend).replace('@', '').charAt(0)}
        backgroundColor={palette.avatarPlaceholderBg}
      />
      <View style={styles.body}>
        <Text style={[styles.name, { color: palette.primaryText }]} numberOfLines={1}>
          {rowName(friend)}
        </Text>
        {status ? (
          <Text style={styles.status} numberOfLines={1}>
            <Text style={{ color: healthToneColor(status.health.tone, palette) }}>
              {status.health.label}
            </Text>
            <Text style={{ color: palette.secondaryText }}> · {status.placeLabel}</Text>
          </Text>
        ) : (
          <Text style={[styles.status, { color: palette.secondaryText }]}>No pet yet</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
  status: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.2 },
});
