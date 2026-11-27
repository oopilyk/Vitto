import { ActionSheetIOS, Platform } from 'react-native';
import {
  REPLY_REPORT_REASONS,
  REPLY_REPORT_REASON_LABEL,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  REPORT_THANKS,
  type ReportReason,
  errorMessage,
} from '@vitto/core';
import { companionService } from '../services/companionService';
import { showAlert } from '../services/dialog';
import { friendsService } from '../services/friendsService';
import { t } from '../i18n';

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
  sheet(name, [t('Report {name}', { name }), t('Block {name}', { name })], 1, (index) => (index === 0 ? report() : block()));
};

/**
 * Report one of the pet's AI-written replies: a reason, then a thank-you.
 * `onReported` runs once it went in (to mark the bubble).
 */
export const askReportReply = ({ messageId, petName, onReported }: { messageId: string; petName: string; onReported?: () => void }) =>
  sheet(t('Report what {pet} said?', { pet: petName }), [t('Report reply')], 0, () =>
    sheet(t('What’s wrong with it?'), REPLY_REPORT_REASONS.map((reason) => REPLY_REPORT_REASON_LABEL[reason]), undefined, (index) =>
      void companionService
        .reportReply(messageId, REPLY_REPORT_REASONS[index]!)
        .then(() => {
          onReported?.();
          showAlert(t('Report sent'), REPORT_THANKS);
        })
        .catch((cause) => showAlert(t('Could not send the report'), errorMessage(cause, t('Try again in a moment.')))),
    ),
  );

const NEXT_SHEET_MS = 350;

/** An action sheet on iOS, an alert elsewhere; `onPick` gets the chosen index. */
const sheet = (title: string, options: string[], destructive: number | undefined, onPick: (index: number) => void) => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, t('Cancel')], cancelButtonIndex: options.length, destructiveButtonIndex: destructive },
      // After the sheet has gone: presenting the next one while this one is
      // still closing is silently dropped on iOS.
      (index) => {
        if (index < options.length) setTimeout(() => onPick(index), NEXT_SHEET_MS);
      },
    );
    return;
  }
  showAlert(title, undefined, [
    ...options.map((text, index) => ({ text, style: index === destructive ? ('destructive' as const) : undefined, onPress: () => onPick(index) })),
    { text: t('Cancel'), style: 'cancel' as const },
  ]);
};

const chooseReason = (name: string, onPick: (reason: ReportReason) => void) =>
  sheet(t('Why are you reporting {name}?', { name }), REPORT_REASONS.map((reason) => REPORT_REASON_LABEL[reason]), undefined, (index) =>
    onPick(REPORT_REASONS[index]!),
  );

const sendReport = async (userId: string, name: string, reason: ReportReason, block: () => void) => {
  try {
    await friendsService.reportUser(userId, reason);
    showAlert(t('Report sent'), t("{thanks} You can also block {name} so they can't reach you.", { thanks: REPORT_THANKS, name }), [
      { text: t('Block {name}', { name }), style: 'destructive', onPress: () => setTimeout(block, NEXT_SHEET_MS) },
      { text: t('Done'), style: 'cancel' },
    ]);
  } catch (cause) {
    showAlert(t('Could not send the report'), errorMessage(cause, t('Try again in a moment.')));
  }
};

const confirmBlock = (userId: string, name: string, onBlocked?: () => void) =>
  showAlert(
    t('Block {name}?', { name }),
    t("You won't be friends any more, they can't send you friend requests or reactions, and you won't see each other in search. They won't be told. You can unblock them in Friends."),
    [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Block'),
        style: 'destructive',
        onPress: () =>
          void friendsService
            .blockUser(userId)
            .then(() => onBlocked?.())
            .catch((cause) => showAlert(t('Could not block them'), errorMessage(cause, t('Try again in a moment.')))),
      },
    ],
  );
