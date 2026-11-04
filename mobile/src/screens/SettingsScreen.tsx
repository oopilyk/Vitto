import { Alert, Linking, Platform, View } from 'react-native';
import { type BodyProfile, CARE_AREAS, type CareArea, PET_PERSONALITY_OPTIONS, type PetBreed, type PetState, type PetVoice, ownedBreedsOf, tracksArea } from '@vitto/core';
import { SpriteFrame } from '../components/SpriteFrame';
import { NavGroup, NavRow, SegmentedControl, SettingsPage, ToggleRow } from '../components/settingsKit';
import { sheetByBreed, portraitFrame } from '../components/petSprites';
import { LEGAL_LINKS } from '../services/billingService';
import { colors, themedStyles } from '../theme';

interface Props {
  profile: BodyProfile;
  onClose: () => void;
  /** The pet's look; the Animals row shows only once it is wired up. */
  breed?: PetBreed;
  onBreedChange?: (breed: PetBreed) => void;
  /** The pet's coin balance, shown on the Animals row. */
  coins?: number;
  /** What a new animal costs; zero (the dev account) is free. */
  breedChangeCost?: number;
  /** The pet, for its name and personality on the rows. */
  pet?: Pick<PetState, 'name' | 'personality' | 'dials' | 'persona' | 'careAreas'> & Partial<Pick<PetState, 'ownedBreeds'>>;
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
  /** What the pet remembers about them (needs the server, so absent offline). */
  onOpenMemories?: () => void;
  onOpenNotifications?: () => void;
  onOpenPreferences?: () => void;
  /** What affects the pet (see CareAreasScreen). */
  onOpenCareAreas?: () => void;
  /** The appearance choice, for its row's value ("System", "Dark"...). */
  appearanceLabel?: string;
  onOpenAppearance?: () => void;
  /** The background music; absent hides the switch. */
  musicOn?: boolean;
  onMusicChange?: (on: boolean) => void;
  /** The pet reading its lines aloud; absent hides the switch. */
  voiceOn?: boolean;
  /** Under the switch instead of the usual line: the download's progress, or why it failed. */
  voiceStatus?: string;
  onVoiceChange?: (on: boolean) => void;
  /** Whose voice the pet speaks in; shown while the voice is on. */
  petVoice?: PetVoice;
  onPetVoiceChange?: (voice: PetVoice) => void;
  /** Opens the page that deletes the account. Absent offline. */
  onOpenDeleteAccount?: () => void;
}

/**
 * The open-source work the app ships, with the attribution its licences ask
 * for. The pet's voice is Kokoro, its pronunciations are misaki's, and both
 * run on ONNX Runtime.
 */
const CREDITS = [
  'Pet voice: Kokoro-82M by hexgrad (Apache License 2.0), via the ONNX build by onnx-community.',
  'Pronunciations: misaki by hexgrad (Apache License 2.0).',
  'Voice engine: ONNX Runtime by Microsoft (MIT License).',
  'Apache License 2.0: apache.org/licenses/LICENSE-2.0',
].join('\n\n');

// react-native-web's Alert does nothing, so the browser's own alert there.
const showCredits = () => (Platform.OS === 'web' ? window.alert(`Credits\n\n${CREDITS}`) : Alert.alert('Credits', CREDITS));

const CARE_AREA_LABEL: Record<CareArea, string> = { nutrition: 'Food', training: 'Workouts', movement: 'Steps', mind: 'Mind games' };

/** "Everything", or the areas that are on: "Workouts, Steps". */
const careAreasSummary = (areas: readonly CareArea[] | undefined) => {
  const on = CARE_AREAS.filter((area) => tracksArea(areas, area));
  return on.length === CARE_AREAS.length ? 'Food, workouts, steps and mind games' : on.map((area) => CARE_AREA_LABEL[area]).join(', ');
};

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
  onOpenMemories,
  onOpenNotifications,
  onOpenPreferences,
  onOpenCareAreas,
  appearanceLabel,
  onOpenAppearance,
  musicOn,
  onMusicChange,
  voiceOn,
  voiceStatus,
  onVoiceChange,
  petVoice,
  onPetVoiceChange,
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
            title="Animals & forms"
            value={[
              breed ? sheetByBreed(breed).label : null,
              `${ownedBreedsOf({ breed, ownedBreeds: pet?.ownedBreeds }).length} owned`,
              breedChangeCost > 0 ? `${coins} coins` : 'Switching is free',
            ]
              .filter(Boolean)
              .join(' · ')}
            leading={
              breed ? (
                <View style={styles.art}>
                  <SpriteFrame sheet={sheetByBreed(breed)} frame={portraitFrame(sheetByBreed(breed))} size={60} />
                </View>
              ) : undefined
            }
            onPress={onOpenChooseCompanion}
            testID="change-animal"
          />
        ) : null}
        {pet && onOpenCareAreas ? (
          <NavRow
            title={`What affects ${pet.name}`}
            value={careAreasSummary(pet.careAreas)}
            onPress={onOpenCareAreas}
            testID="open-care-areas"
          />
        ) : null}
        {pet && onOpenPersonality ? (
          <NavRow title="Personality" value={personalityLabel} onPress={onOpenPersonality} testID="open-personality" />
        ) : null}
        {pet && onOpenMemories ? (
          <NavRow
            title={`What ${pet.name} remembers`}
            value="See and delete what it knows about you"
            onPress={onOpenMemories}
            testID="open-memories"
          />
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

      <NavGroup title="App">
        {onOpenAppearance ? (
          <NavRow title="Appearance" value={appearanceLabel} onPress={onOpenAppearance} testID="open-appearance" />
        ) : null}
        {typeof musicOn === 'boolean' && onMusicChange ? (
          <View style={styles.toggle} testID="music-toggle">
            <ToggleRow title="Music" description="Quiet lo-fi while the app is open." value={musicOn} onChange={onMusicChange} />
          </View>
        ) : null}
        {typeof voiceOn === 'boolean' && onVoiceChange ? (
          <View style={styles.toggle} testID="voice-toggle">
            <ToggleRow title="Pet voice" description={voiceStatus ?? 'Your pet says its lines out loud.'} value={voiceOn} onChange={onVoiceChange} />
          </View>
        ) : null}
        {voiceOn && petVoice && onPetVoiceChange ? (
          <View style={styles.toggle} testID="pet-voice-choice">
            <SegmentedControl<PetVoice>
              options={[
                { value: 'female', label: 'Girl' },
                { value: 'male', label: 'Boy' },
              ]}
              value={petVoice}
              onChange={onPetVoiceChange}
            />
          </View>
        ) : null}
      </NavGroup>

      {/* Always reachable, not only next to a purchase: App Review asks for both. */}
      <NavGroup title="Legal">
        {LEGAL_LINKS.privacy ? (
          <NavRow title="Privacy Policy" onPress={() => void Linking.openURL(LEGAL_LINKS.privacy!)} testID="open-privacy" />
        ) : null}
        <NavRow title="Terms of Use" onPress={() => void Linking.openURL(LEGAL_LINKS.terms)} testID="open-terms" />
        <NavRow title="Credits" onPress={showCredits} testID="open-credits" />
      </NavGroup>

      {onOpenDeleteAccount ? (
        <NavGroup title="Account">
          <NavRow title="Delete account" onPress={onOpenDeleteAccount} danger testID="open-delete-account" />
        </NavGroup>
      ) : null}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  // A switch among the menu rows, padded to line up with them.
  toggle: { paddingHorizontal: 16, paddingVertical: 4 },
  // The sprite is drawn larger than its tile and cropped: its cell has empty margins.
  art: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: colors.tile,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
}));
