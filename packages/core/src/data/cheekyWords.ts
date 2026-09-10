/**
 * Words the word games accept that the generated lexicon leaves out or keeps
 * off the answer pool: profanity, crude anatomy and sex. Hand-maintained, since
 * the lexicon build strips these on purpose and must not be regenerated to get
 * them back.
 *
 * What these are used for, and what they are never used for:
 *
 *   - Valid guesses in the daily word puzzle, and words that count in Word
 *     Garden -- both with full points.
 *   - NEVER a daily answer, and NEVER the word a Word Garden board is grown
 *     from. A player has to choose to type one; the game never puts one in
 *     front of them.
 *
 * Deliberately not here: slurs for any group, and anything about sexual
 * violence or minors. Those stay filtered out entirely.
 *
 * Lowercase, 4 to 6 letters, matching the lexicon's shape.
 */
export const CHEEKY_WORDS: readonly string[] = [
  // Profanity.
  'arse', 'arses', 'bitch', 'bloody', 'bollix', 'bugger', 'crap', 'crappy', 'craps', 'damn', 'damned',
  'damnit', 'douche', 'fart', 'farted', 'farts', 'fuck', 'fucked', 'fucker', 'fuckin', 'fucks', 'fuckup',
  'goddam', 'hell', 'hells', 'jerk', 'piss', 'pissed', 'pisser', 'pisses', 'poop', 'pooped', 'poops',
  'potty', 'prat', 'puke', 'shag', 'shat', 'shit', 'shite', 'shits', 'shitty', 'snot', 'suck', 'sucked',
  'sucker', 'sucks', 'tosser', 'turd', 'turds', 'twat', 'wank', 'wanker', 'cunt', 'cunts',
  // Bodies.
  'anal', 'anus', 'balls', 'boner', 'boob', 'boobs', 'booby', 'booty', 'bosom', 'busty', 'butt', 'buxom',
  'clit', 'cock', 'cocks', 'crotch', 'dick', 'dicks', 'fanny', 'gash', 'juggs', 'knob', 'loins', 'muff',
  'nipple', 'penis', 'phalli', 'prick', 'pubes', 'pubic', 'pussy', 'quim', 'rectum', 'scrota', 'semen',
  'sperm', 'snatch', 'teat', 'tits', 'titty', 'tushy', 'vagina', 'vulva', 'wedgie',
  // Sex.
  'bawdy', 'bimbo', 'bimbos', 'coitus', 'dildo', 'dildos', 'erect', 'erotic', 'fetish', 'fondle',
  'harem', 'hickey', 'horny', 'hussy', 'jism', 'jizz', 'kinky', 'lecher', 'libido', 'lust', 'lusty',
  'milf', 'naked', 'nude', 'nudism', 'nudist', 'nudity', 'nympho', 'orgasm', 'orgy', 'panty', 'porn',
  'porno', 'randy', 'raunch', 'seduce', 'sexcam', 'sexual', 'sexy', 'skeet', 'sleaze', 'sleazy', 'slut',
  'sluts', 'slutty', 'smut', 'smutty', 'spank', 'spunk', 'squirt', 'steamy', 'sultry', 'thong', 'undies',
  'whore', 'whores', 'floozy', 'harlot', 'hooker', 'gigolo', 'pimp', 'tart', 'tramp', 'wench',
];

const CHEEKY_SET: ReadonlySet<string> = new Set(CHEEKY_WORDS);

export const isCheekyWord = (word: string): boolean => CHEEKY_SET.has(word.toLowerCase());
