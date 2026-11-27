import { DangerButton, DangerZone, SettingsPage } from '../components/settingsKit';
import { t } from '../i18n';

interface Props {
  /** Deletes the account for good. Owns its own confirmation (see App), so it runs only once agreed. */
  onDeleteAccount: () => Promise<void>;
  deleting?: boolean;
  onClose: () => void;
}

/** Deleting the account, on its own page (from Settings), so it is never one stray tap from the menu. */
export function DeleteAccountScreen({ onDeleteAccount, deleting, onClose }: Props) {
  return (
    <SettingsPage title={t('Delete account')} backLabel={t('Settings')} onBack={onClose}>
      <DangerZone
        title={t('This is permanent')}
        description={t('Permanently deletes your account, your pet and everything you have logged. A pet you share stays with your care partner. This cannot be undone.')}
      >
        <DangerButton label={deleting ? t('Deleting...') : t('Delete account')} disabled={deleting} onPress={() => void onDeleteAccount()} />
      </DangerZone>
    </SettingsPage>
  );
}
