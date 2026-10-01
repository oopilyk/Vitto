import { DangerButton, DangerZone, SettingsPage } from '../components/settingsKit';

interface Props {
  /** Deletes the account for good. Owns its own confirmation (see App), so it runs only once agreed. */
  onDeleteAccount: () => Promise<void>;
  deleting?: boolean;
  onClose: () => void;
}

/** Deleting the account, on its own page (from Settings), so it is never one stray tap from the menu. */
export function DeleteAccountScreen({ onDeleteAccount, deleting, onClose }: Props) {
  return (
    <SettingsPage title="Delete account" backLabel="Settings" onBack={onClose}>
      <DangerZone
        title="This is permanent"
        description="Permanently deletes your account, your pet and everything you have logged. A pet you share stays with your care partner. This cannot be undone."
      >
        <DangerButton label={deleting ? 'Deleting...' : 'Delete account'} disabled={deleting} onPress={() => void onDeleteAccount()} />
      </DangerZone>
    </SettingsPage>
  );
}
