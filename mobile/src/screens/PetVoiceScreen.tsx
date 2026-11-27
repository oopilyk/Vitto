import { PET_VOICES, type PetVoice } from '@vitto/core';
import { SelectionList, SettingsPage, SettingsSection } from '../components/settingsKit';
import { VOICE_STYLES } from '../services/petVoice';
import { t } from '../i18n';

interface Props {
  petName: string;
  voice: PetVoice;
  /** Saves it; the pet then says a line in the new voice. */
  onChange: (next: PetVoice) => void;
  onClose: () => void;
}

const DETAIL: Record<PetVoice, string> = {
  female: t('Bright and friendly'),
  male: t('Warm and easygoing'),
  deep: t('Very low, very serious'),
  'squeaky-female': t('Tiny and high'),
  'squeaky-male': t('Tiny and high'),
  'fast-female': t('Talks a mile a minute'),
  'fast-male': t('Talks a mile a minute'),
  santa: t('Ho ho ho'),
};

/** Which voice the pet speaks in (from Settings, while the voice is on). Picking one plays it. */
export function PetVoiceScreen({ petName, voice, onChange, onClose }: Props) {
  return (
    <SettingsPage title={t('Pet voice')} backLabel={t('Settings')} onBack={onClose}>
      <SettingsSection title={t('Voice')} description={t('Tap one to hear {pet} say hi in it.', { pet: petName })} first>
        <SelectionList<PetVoice>
          options={PET_VOICES.map((option) => ({ value: option, label: VOICE_STYLES[option].label, detail: DETAIL[option] }))}
          value={voice}
          onChange={onChange}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
