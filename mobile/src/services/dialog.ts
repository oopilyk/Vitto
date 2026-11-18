import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * `Alert.alert` that also works in a browser.
 *
 * On react-native-web `Alert.alert` does nothing at all: no box, no buttons,
 * no callback (see confirmDialog.test), so a button that asks first looked
 * dead on the web build. There, the browser's own boxes stand in: a message
 * with no choice is `window.alert`; each choice is offered in turn as a
 * `window.confirm`, the first one accepted wins, and declining them all is
 * Cancel. Phones get the real alert, unchanged.
 */
export const showAlert = (title: string, message?: string, buttons?: AlertButton[]): void => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const body = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((button) => button.style === 'cancel');
  const choices = (buttons ?? []).filter((button) => button.style !== 'cancel');
  if (typeof window === 'undefined') return;
  if (!cancel && choices.length <= 1) {
    window.alert(body);
    choices[0]?.onPress?.();
    return;
  }
  for (const choice of choices) {
    const prompt = choices.length === 1 ? `${body}\n\nOK to ${String(choice.text).toLowerCase()}.` : `${body}\n\n${choice.text}?`;
    if (window.confirm(prompt)) {
      choice.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
};
