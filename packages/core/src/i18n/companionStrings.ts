import { msg } from './translate';

/**
 * Strings written in packages/core/src/companion and drawn by the app. That
 * folder is copied to the server as it is and cannot import from here, so its
 * visible strings are listed here for the catalogs instead, and the screens
 * that draw them look them up with `t(value)` (CharacterDials, CharacterEditor).
 *
 * Keep in step with DIAL_LABELS and describeDials in companion/personality.ts;
 * i18n.test.ts checks that it is.
 */
export const DIAL_WORDS: readonly string[] = [
  msg('serious'), msg('playful'),
  msg('gentle'), msg('blunt'),
  msg('calm'), msg('energetic'),
  msg('wholesome'), msg('sarcastic'),
  msg('independent'), msg('clingy'),
];

export const DIAL_PHRASES: readonly string[] = [
  msg('quite serious'), msg('quite playful'),
  msg('quite gentle'), msg('quite blunt'),
  msg('quite calm'), msg('quite energetic'),
  msg('quite wholesome'), msg('quite sarcastic'),
  msg('quite independent'), msg('quite clingy'),
  msg('extremely serious'), msg('extremely playful'),
  msg('extremely gentle'), msg('extremely blunt'),
  msg('extremely calm'), msg('extremely energetic'),
  msg('extremely wholesome'), msg('extremely sarcastic'),
  msg('extremely independent'), msg('extremely clingy'),
];
