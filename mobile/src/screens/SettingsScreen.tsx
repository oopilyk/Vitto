import { Alert, Linking, Platform, View } from 'react-native';
import { type BodyProfile, CARE_AREAS, type CareArea, type Locale, PET_PERSONALITY_OPTIONS, type PetBreed, type PetState, type PetVoice, ownedBreedsOf, tracksArea } from '@vitto/core';
import { SpriteFrame } from '../components/SpriteFrame';
import { NavGroup, NavRow, SettingsPage, ToggleRow } from '../components/settingsKit';
import { sheetByBreed, portraitFrame } from '../components/petSprites';
import { LEGAL_LINKS } from '../services/billingService';
import { VOICE_STYLES } from '../services/petVoice';
import { colors, themedStyles } from '../theme';
import { getLocale, petSpeechAvailable, t, tn, tx } from '../i18n';

interface Props {
  profile: BodyProfile;
  onClose: () => void;
  /** Names where the back link goes: Profile, or the pet when opened from its account menu. */
  backLabel?: string;
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
  /** The voice is Plus: without it the switch becomes a row that opens Plus. */
  voiceLocked?: boolean;
  /** Whose voice the pet speaks in; shown while the voice is on. */
  petVoice?: PetVoice;
  /** Opens the page that picks it. */
  onOpenPetVoice?: () => void;
  /** Opens the page that changes the password. Absent offline. */
  onOpenChangePassword?: () => void;
  /** Opens the page that deletes the account. Absent offline. */
  onOpenDeleteAccount?: () => void;
}

/**
 * The open-source work the app ships, with the attribution its licences ask
 * for. The pet's voice is Kokoro, its pronunciations are misaki's, and both
 * run on ONNX Runtime.
 */
const CREDITS = [
  t('Food data: Open Food Facts (openfoodfacts.org), under the Open Database License; USDA FoodData Central; and the fatsecret Platform API.'),
  t('Pet voice: Kokoro-82M by hexgrad (Apache License 2.0), via the ONNX build by onnx-community.'),
  t('Pronunciations: misaki by hexgrad (Apache License 2.0).'),
  t('Voice engine: ONNX Runtime by Microsoft (MIT License).'),
  'Apache License 2.0: apache.org/licenses/LICENSE-2.0',
].join('\n\n');

// react-native-web's Alert does nothing, so the browser's own alert there.
const showCredits = () => (Platform.OS === 'web' ? window.alert(`${t('Credits')}\n\n${CREDITS}`) : Alert.alert(t('Credits'), CREDITS));

const CARE_AREA_LABEL: Record<CareArea, string> = { nutrition: t('Food'), training: t('Workouts'), movement: t('Steps'), mind: t('Mind games') };

/** Each language's own name for itself, as iOS lists them: never translated. */
const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', es: 'Español', 'zh-Hans': '简体中文' };

/** "Everything", or the areas that are on: "Workouts, Steps". */
const careAreasSummary = (areas: readonly CareArea[] | undefined) => {
  const on = CARE_AREAS.filter((area) => tracksArea(areas, area));
  return on.length === CARE_AREAS.length ? t('Food, workouts, steps and mind games') : on.map((area) => CARE_AREA_LABEL[area]).join(tx('between the items of a list', ', '));
};

const GOAL_LABEL: Record<BodyProfile['goal'], string> = {
  lose: t('Lose fat'),
  maintain: t('Maintain'),
  gain: t('Build muscle'),
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
  backLabel = t('Profile'),
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
  voiceLocked = false,
  petVoice,
  onOpenPetVoice,
  onOpenChangePassword,
  onOpenDeleteAccount,
}: Props) {
  const preferenceSummary = [profile.displayName, profile.age ? `${profile.age}` : null, GOAL_LABEL[profile.goal]]
    .filter(Boolean)
    .join(' · ');
  const personalityLabel = canCustomise
    ? PET_PERSONALITY_OPTIONS.find((option) => option.value === pet?.personality)?.label
    : t('A Plus feature');

  return (
    <SettingsPage title={t('Settings')} backLabel={backLabel} onBack={onClose}>
      {onOpenPlus ? (
        <NavGroup>
          <NavRow
            title="Vitto Plus"
            value={isPlus ? t('On · manage your plan') : t('Personalities, a sharper voice, and more')}
            onPress={onOpenPlus}
            testID="plus-row"
          />
        </NavGroup>
      ) : null}

      <NavGroup title={t('Your companion')}>
        {onBreedChange && onOpenChooseCompanion ? (
          <NavRow
            title={t('Shop')}
            value={[
              breed ? sheetByBreed(breed).label : null,
              t('{count} owned', { count: ownedBreedsOf({ breed, ownedBreeds: pet?.ownedBreeds }).length }),
              breedChangeCost > 0 ? tn(coins, '{count} coin', '{count} coins') : t('Switching is free'),
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
            title={t('What affects {pet}', { pet: pet.name })}
            value={careAreasSummary(pet.careAreas)}
            onPress={onOpenCareAreas}
            testID="open-care-areas"
          />
        ) : null}
        {pet && onOpenPersonality ? (
          <NavRow title={t('Personality')} value={personalityLabel} onPress={onOpenPersonality} testID="open-personality" />
        ) : null}
        {pet && onOpenMemories ? (
          <NavRow
            title={t('What {pet} remembers', { pet: pet.name })}
            value={t('See and delete what it knows about you')}
            onPress={onOpenMemories}
            testID="open-memories"
          />
        ) : null}
      </NavGroup>

      <NavGroup title={t('You')}>
        {onOpenPreferences ? (
          <NavRow title={t('Your preferences')} value={preferenceSummary} onPress={onOpenPreferences} testID="open-preferences" />
        ) : null}
        {onOpenNotifications && typeof notificationsOn === 'boolean' ? (
          <NavRow title={t('Notifications')} value={notificationsOn ? t('On') : t('Off')} onPress={onOpenNotifications} testID="open-notifications" />
        ) : null}
      </NavGroup>

      <NavGroup title={t('App')}>
        {onOpenAppearance ? (
          <NavRow title={t('Appearance')} value={appearanceLabel} onPress={onOpenAppearance} testID="open-appearance" />
        ) : null}
        {typeof musicOn === 'boolean' && onMusicChange ? (
          <View style={styles.toggle} testID="music-toggle">
            <ToggleRow title={t('Music')} description={t('Quiet lo-fi while the app is open.')} value={musicOn} onChange={onMusicChange} />
          </View>
        ) : null}
        {/* The voice is English only: in another language nothing here offers it. */}
        {!petSpeechAvailable() ? null : typeof voiceOn === 'boolean' && onVoiceChange && voiceLocked ? (
          onOpenPlus ? <NavRow title={t('Pet voice')} value={t('A Plus feature')} onPress={onOpenPlus} testID="voice-locked" /> : null
        ) : typeof voiceOn === 'boolean' && onVoiceChange ? (
          <View style={styles.toggle} testID="voice-toggle">
            <ToggleRow title={t('Pet voice')} description={voiceStatus ?? t('Your pet says its lines out loud.')} value={voiceOn} onChange={onVoiceChange} />
          </View>
        ) : null}
        {petSpeechAvailable() && voiceOn && !voiceLocked && petVoice && onOpenPetVoice ? (
          <NavRow title={t('Voice')} value={VOICE_STYLES[petVoice].label} onPress={onOpenPetVoice} testID="pet-voice-choice" />
        ) : null}
        {/* iOS keeps an app's language in the system Settings app, and restarts the app when it changes. */}
        {Platform.OS !== 'web' ? (
          <NavRow
            title={t('Language')}
            value={LANGUAGE_NAME[getLocale()]}
            hint={t('Change the language in your phone’s Settings.')}
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            testID="open-language"
          />
        ) : null}
      </NavGroup>

      {/* Always reachable, not only next to a purchase: App Review asks for both. */}
      <NavGroup title={t('Legal')}>
        {LEGAL_LINKS.privacy ? (
          <NavRow title={t('Privacy Policy')} onPress={() => void Linking.openURL(LEGAL_LINKS.privacy!)} testID="open-privacy" />
        ) : null}
        <NavRow title={t('Terms of Use')} onPress={() => void Linking.openURL(LEGAL_LINKS.terms)} testID="open-terms" />
        <NavRow title={t('Credits')} onPress={showCredits} testID="open-credits" />
      </NavGroup>

      {onOpenChangePassword || onOpenDeleteAccount ? (
        <NavGroup title={t('Account')}>
          {onOpenChangePassword ? (
            <NavRow title={t('Change password')} onPress={onOpenChangePassword} testID="open-change-password" />
          ) : null}
          {onOpenDeleteAccount ? (
            <NavRow title={t('Delete account')} onPress={onOpenDeleteAccount} danger testID="open-delete-account" />
          ) : null}
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
    borderRadius: 12,
    backgroundColor: colors.tile,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
}));
