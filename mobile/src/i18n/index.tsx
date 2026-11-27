import { Fragment, type ReactNode } from 'react';
import { tParts, type Params } from '@vitto/core';

export { dictationLanguage, formatLocale, getLocale, isCjk, msg, petSpeechAvailable, t, tn, tx, wordPuzzleAvailable } from '@vitto/core';

/**
 * A translated sentence with something other than plain text inside it: a
 * bold price, a link. Each `{slot}` in the English is replaced by the node of
 * that name, wherever the translation puts it:
 *
 *   tRich('{days} days free, then {price}', { price: <Text style={bold}>{price}</Text> }, { days })
 *
 * Use inside a <Text>. Never build such a sentence by joining translated
 * halves: another language orders them differently.
 */
export const tRich = (source: string, slots: Record<string, ReactNode>, params?: Params): ReactNode[] =>
  tParts(source, params).map((part, index) => <Fragment key={index}>{'text' in part ? part.text : slots[part.slot]}</Fragment>);
