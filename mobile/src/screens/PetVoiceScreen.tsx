import { PET_VOICES, type PetVoice } from '@vitto/core';
import { SelectionList, SettingsPage, SettingsSection } from '../components/settingsKit';
import { VOICE_STYLES } from '../services/petVoice';

interface Props {
  petName: string;
  voice: PetVoice;
  /** Saves it; the pet then says a line in the new voice. */
  onChange: (next: PetVoice) => void;
  onClose: () => void;
}

const DETAIL: Record<PetVoice, string> = {
  female: 'Bright and friendly',
  male: 'Warm and easygoing',
  deep: 'Very low, very serious',
  'squeaky-female': 'Tiny and high',
  'squeaky-male': 'Tiny and high',
  'fast-female': 'Talks a mile a minute',
  'fast-male': 'Talks a mile a minute',
  santa: 'Ho ho ho',
};

/** Which voice the pet speaks in (from Settings, while the voice is on). Picking one plays it. */
export function PetVoiceScreen({ petName, voice, onChange, onClose }: Props) {
  return (
    <SettingsPage title="Pet voice" backLabel="Settings" onBack={onClose}>
      <SettingsSection title="Voice" description={`Tap one to hear ${petName} say hi in it.`} first>
        <SelectionList<PetVoice>
          options={PET_VOICES.map((option) => ({ value: option, label: VOICE_STYLES[option].label, detail: DETAIL[option] }))}
          value={voice}
          onChange={onChange}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
