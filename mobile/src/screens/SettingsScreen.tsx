import { StyleSheet, View } from 'react-native';
import { type BodyProfile, PET_PERSONALITY_OPTIONS, type PetBreed, type PetState } from '@vitto/core';
import { SpriteFrame } from '../components/SpriteFrame';
import { NavGroup, NavRow, SettingsPage } from '../components/settingsKit';
import { sheetByBreed } from '../components/petSprites';

interface Props {
  profile: BodyProfile;
  onClose: () => void;
  /** The pet's look; the Animal row shows only once it is wired up. */
  breed?: PetBreed;
  onBreedChange?: (breed: PetBreed) => void;
  /** The pet's coin balance, shown on the Animal row. */
  coins?: number;
  /** What switching the animal costs; zero (the dev account) is free. */
  breedChangeCost?: number;
  /** The pet, for its name and personality on the rows. */
  pet?: Pick<PetState, 'name' | 'personality' | 'dials' | 'persona'>;
  /** Whether the account has Plus, for the Plus row's wording. */
  isPlus?: boolean;
  /** Whether personalities can be changed (Plus); otherwise the row says so. Defaults to true. */
  canCustomise?: boolean;
  /** Whether any notification is on here; null or absent hides the row (nothing to set on this device). */
  notificationsOn?: boolean | null;
  /** Each row opens its own page. A row shows only when its page is wired up. */
  onOpenPlus?: () => void;
  onOpenChooseCompanion?: () => void;
  onOpenPersonality?: () => void;
  onOpenNotifications?: () => void;
  onOpenPreferences?: () => void;
  /** Opens the page that deletes the account. Absent offline. */
  onOpenDeleteAccount?: () => void;
}

const GOAL_LABEL: Record<BodyProfile['goal'], string> = {
  lose: 'Lose fat',
  maintain: 'Maintain',
  gain: 'Build muscle',
};

/**
 * Settings, as a menu: one row per setting, each showing what it is set to now
 * and opening a page of its own -- the Instagram / TikTok pattern, so this page
 * stays short and scannable however much each setting grows. Reached from
 * Profile's top bar.
 */
export function SettingsScreen({
  profile,
  onClose,
  breed,
  onBreedChange,
  coins = 0,
  breedChangeCost = 0,
  pet,
  isPlus = false,
  canCustomise = true,
  notificationsOn,
  onOpenPlus,
  onOpenChooseCompanion,
  onOpenPersonality,
  onOpenNotifications,
  onOpenPreferences,
  onOpenDeleteAccount,
}: Props) {
  const preferenceSummary = [profile.displayName, profile.age ? `${profile.age}` : null, GOAL_LABEL[profile.goal]]
    .filter(Boolean)
    .join(' · ');
  const personalityLabel = canCustomise
    ? PET_PERSONALITY_OPTIONS.find((option) => option.value === pet?.personality)?.label
    : 'A Plus feature';

  return (
    <SettingsPage title="Settings" backLabel="Profile" onBack={onClose}>
      {onOpenPlus ? (
        <NavGroup>
          <NavRow
            title="Vitto Plus"
            value={isPlus ? 'On · manage your plan' : 'Personalities, a sharper voice, and more'}
            onPress={onOpenPlus}
            testID="plus-row"
          />
        </NavGroup>
      ) : null}

      <NavGroup title="Your companion">
        {onBreedChange && onOpenChooseCompanion ? (
          <NavRow
            title="Animal"
            value={[breed ? sheetByBreed(breed).label : null, breedChangeCost > 0 ? `${coins} coins` : 'Switching is free']
              .filter(Boolean)
              .join(' · ')}
            leading={
              breed ? (
                <View style={styles.art}>
                  <SpriteFrame sheet={sheetByBreed(breed)} frame={sheetByBreed(breed).animations.idle[0]} size={60} />
                </View>
              ) : undefined
            }
            onPress={onOpenChooseCompanion}
            testID="change-animal"
          />
        ) : null}
        {pet && onOpenPersonality ? (
          <NavRow title="Personality" value={personalityLabel} onPress={onOpenPersonality} testID="open-personality" />
        ) : null}
      </NavGroup>

      <NavGroup title="You">
        {onOpenPreferences ? (
          <NavRow title="Your preferences" value={preferenceSummary} onPress={onOpenPreferences} testID="open-preferences" />
        ) : null}
        {onOpenNotifications && typeof notificationsOn === 'boolean' ? (
          <NavRow title="Notifications" value={notificationsOn ? 'On' : 'Off'} onPress={onOpenNotifications} testID="open-notifications" />
        ) : null}
      </NavGroup>

      {onOpenDeleteAccount ? (
        <NavGroup title="Account">
          <NavRow title="Delete account" onPress={onOpenDeleteAccount} danger testID="open-delete-account" />
        </NavGroup>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  // The sprite is drawn larger than its tile and cropped: its cell has empty margins.
  art: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#efe7d8',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
});
