import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { REPORT_REASONS, REPORT_REASON_LABEL, REPORT_THANKS, type ReportReason, errorMessage } from '@vitto/core';
import { friendsService } from '../services/friendsService';

/**
 * Report or block another person, from wherever they are shown (their pet, a
 * friend row, a request). One sheet everywhere, the way iOS apps do it:
 * Report leads to a reason and then offers to block as well; Block asks once,
 * says what it does, and is never told to them.
 */
export const askReportOrBlock = ({
  userId,
  name,
  onBlocked,
}: {
  userId: string;
  /** How they are shown: "@alex". */
  name: string;
  /** After a block went through: leave their pet, refresh the list. */
  onBlocked?: () => void;
}) => {
  const block = () => confirmBlock(userId, name, onBlocked);
  const report = () => chooseReason(name, (reason) => void sendReport(userId, name, reason, block));
  sheet(name, [`Report ${name}`, `Block ${name}`], 1, (index) => (index === 0 ? report() : block()));
};

const NEXT_SHEET_MS = 350;

/** An action sheet on iOS, an alert elsewhere; `onPick` gets the chosen index. */
const sheet = (title: string, options: string[], destructive: number | undefined, onPick: (index: number) => void) => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, 'Cancel'], cancelButtonIndex: options.length, destructiveButtonIndex: destructive },
      // After the sheet has gone: presenting the next one while this one is
      // still closing is silently dropped on iOS.
      (index) => {
        if (index < options.length) setTimeout(() => onPick(index), NEXT_SHEET_MS);
      },
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((text, index) => ({ text, style: index === destructive ? ('destructive' as const) : undefined, onPress: () => onPick(index) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
};

const chooseReason = (name: string, onPick: (reason: ReportReason) => void) =>
  sheet(`Why are you reporting ${name}?`, REPORT_REASONS.map((reason) => REPORT_REASON_LABEL[reason]), undefined, (index) =>
    onPick(REPORT_REASONS[index]!),
  );

const sendReport = async (userId: string, name: string, reason: ReportReason, block: () => void) => {
  try {
    await friendsService.reportUser(userId, reason);
    Alert.alert('Report sent', `${REPORT_THANKS} You can also block ${name} so they can't reach you.`, [
      { text: `Block ${name}`, style: 'destructive', onPress: () => setTimeout(block, NEXT_SHEET_MS) },
      { text: 'Done', style: 'cancel' },
    ]);
  } catch (cause) {
    Alert.alert('Could not send the report', errorMessage(cause, 'Try again in a moment.'));
  }
};

const confirmBlock = (userId: string, name: string, onBlocked?: () => void) =>
  Alert.alert(
    `Block ${name}?`,
    "You won't be friends any more, they can't send you friend requests or reactions, and you won't see each other in search. They won't be told. You can unblock them in Friends.",
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () =>
          void friendsService
            .blockUser(userId)
            .then(() => onBlocked?.())
            .catch((cause) => Alert.alert('Could not block them', errorMessage(cause, 'Try again in a moment.'))),
      },
    ],
  );
