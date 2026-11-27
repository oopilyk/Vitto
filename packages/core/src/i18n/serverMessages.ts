import { getLocale, msg, t } from './translate';

/**
 * Sentences the server writes and the app shows as they arrive: a refusal
 * from an edge function, a rule in the database. The server answers in
 * English whoever asks (its text is also what an older app shows), so they are
 * translated here, on arrival, by looking the English up like any other
 * string. A sentence not listed here is shown as it came.
 *
 * Keep in step with supabase/functions/* (`json({ error: … })`) and the
 * `raise exception` messages in supabase/migrations.
 */
const FIXED: readonly string[] = [
  // Edge functions
  msg('Authentication required.'),
  msg('Could not read that meal. Try again.'),
  msg('Meal analysis failed. Try again.'),
  msg('Purchases are not set up yet.'),
  msg('Say or type what you ate.'),
  msg('Say something first.'),
  msg('Something went wrong.'),
  msg('Tell us what it actually was.'),
  msg('That device is registered to another account.'),
  msg('That image is too large to analyse.'),
  msg('That kind of image is not supported.'),
  msg('That pet is not yours to talk to.'),
  msg('That photo could not be read.'),
  msg('The companion is unavailable.'),
  msg('Your pet is resting for a bit. Try again later.'),
  // Database rules
  msg("You've sent a lot of friend requests today. Try again tomorrow."),
  msg('That name is too long.'),
  msg("You can't send a friend request to this person."),
  msg("You've sent a lot of reports today. We'll look at the ones you sent."),
  msg("That's a lot of reactions for one friend today. Try again tomorrow."),
  msg("That's a lot of searches. Try again in a little while."),
  msg('That reply could not be found.'),
];

/** Sentences with a number the server fills in: read back out, so one translation covers every value. */
const COUNTED: readonly [RegExp, (count: string) => string][] = [
  [/^Keep it under (\d+) characters\.$/, (count) => t('Keep it under {count} characters.', { count })],
  [
    /^That's (\d+) photo analyses today\. Search or scan your food until tomorrow\.$/,
    (count) => t("That's {count} photo analyses today. Search or scan your food until tomorrow.", { count }),
  ],
  [
    /^You've used your (\d+) free meal descriptions for today\. They come back tomorrow\. Until then, add foods with Search, or get Plus for more\.$/,
    (count) => t("You've used your {count} free meal descriptions for today. They come back tomorrow. Until then, add foods with Search, or get Plus for more.", { count }),
  ],
  [
    /^You've used all (\d+) of today's meal descriptions\. They come back tomorrow\. Until then, add foods with Search or scan them\.$/,
    (count) => t("You've used all {count} of today's meal descriptions. They come back tomorrow. Until then, add foods with Search or scan them.", { count }),
  ],
];

const KNOWN = new Set(FIXED);

/** A sentence from the server in the app's language, or as it came when it is not one we know. */
export const translateServerMessage = (message: string): string => {
  if (getLocale() === 'en') return message;
  const text = message.trim();
  for (const [pattern, translate] of COUNTED) {
    const match = pattern.exec(text);
    if (match) return translate(match[1]!);
  }
  return KNOWN.has(text) ? t(text) : message;
};
