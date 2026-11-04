/**
 * Text as it would be read aloud, before it is turned into sounds: numbers as
 * words ("1,900" -> "one thousand nine hundred"), units and symbols spelled
 * out ("225 lbs" -> "two hundred twenty-five pounds"), and nothing the voice
 * cannot say (emoji, "*wags tail*" stage directions).
 *
 * Only what a pet's line needs: amounts, times, sets and reps. Not a general
 * text normaliser.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: [number, string][] = [
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

const underHundred = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));

const underThousand = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return underHundred(rest);
  return `${ONES[hundreds]} hundred${rest ? ` ${underHundred(rest)}` : ''}`;
};

/** A whole number in words: 2205 -> "two thousand two hundred five". */
export const numberToWords = (n: number): string => {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `minus ${numberToWords(-n)}`;
  n = Math.floor(n);
  if (n < 1000) return underThousand(n);
  const parts: string[] = [];
  for (const [size, name] of SCALES) {
    if (n >= size) {
      parts.push(`${underThousand(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(underThousand(n));
  return parts.join(' ');
};

const ORDINAL_IRREGULAR: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

/** 21 -> "twenty-first". */
export const ordinalToWords = (n: number): string => {
  const words = numberToWords(n);
  return words.replace(/([a-z]+)$/, (last) => {
    if (ORDINAL_IRREGULAR[last]) return ORDINAL_IRREGULAR[last];
    if (last.endsWith('y')) return `${last.slice(0, -1)}ieth`;
    return `${last}th`;
  });
};

/** "12.5" -> "twelve point five". */
const decimalToWords = (whole: string, fraction: string): string =>
  `${numberToWords(Number(whole))} point ${[...fraction].map((digit) => ONES[Number(digit)]).join(' ')}`;

/** Units that follow a number, singular and plural. */
const UNITS: Record<string, [string, string]> = {
  lb: ['pound', 'pounds'],
  lbs: ['pound', 'pounds'],
  kg: ['kilogram', 'kilograms'],
  kgs: ['kilogram', 'kilograms'],
  g: ['gram', 'grams'],
  km: ['kilometer', 'kilometers'],
  mi: ['mile', 'miles'],
  cal: ['calorie', 'calories'],
  kcal: ['calorie', 'calories'],
  ml: ['milliliter', 'milliliters'],
  oz: ['ounce', 'ounces'],
  min: ['minute', 'minutes'],
  mins: ['minute', 'minutes'],
  hr: ['hour', 'hours'],
  hrs: ['hour', 'hours'],
  h: ['hour', 'hours'],
  k: ['thousand', 'thousand'],
};

export const normalizeForSpeech = (input: string): string => {
  let text = input
    // Stage directions and emoji are not said.
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[‘’]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/~/g, ' about ')
    .replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2');

  // Times: "7:30" -> "seven thirty", "7:05" -> "seven oh five", "7:00" -> "seven".
  text = text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => {
    const minutes = Number(m);
    const hour = numberToWords(Number(h));
    if (!minutes) return hour;
    return minutes < 10 ? `${hour} oh ${ONES[minutes]}` : `${hour} ${underHundred(minutes)}`;
  });
  // Money: "$5" -> "5 dollars".
  text = text.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (_, amount: string) => `${amount} ${amount === '1' ? 'dollar' : 'dollars'}`);
  // Sets: "225x8" / "225 x 8" -> "225 for 8".
  text = text.replace(/(\d)\s*[x×]\s*(\d)/gi, '$1 for $2');
  // Thousands separators.
  text = text.replace(/(\d),(?=\d{3}\b)/g, '$1');
  // Ordinals: "1st", "22nd".
  text = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n: string) => ordinalToWords(Number(n)));
  // Percent.
  text = text.replace(/(\d)\s*%/g, '$1 percent');
  // A number and its unit: "225 lbs", "2000kcal", "8k".
  text = text.replace(/(\d+(?:\.\d+)?)\s*([a-z]+)\b/gi, (whole, n: string, unit: string) => {
    const names = UNITS[unit.toLowerCase()];
    if (!names) return whole;
    return `${n} ${Number(n) === 1 ? names[0] : names[1]}`;
  });
  // Whatever numbers are left.
  text = text.replace(/\d+(?:\.\d+)?/g, (n) => {
    const [whole, fraction] = n.split('.');
    return fraction ? decimalToWords(whole, fraction) : numberToWords(Number(whole));
  });

  return text.replace(/\s+/g, ' ').trim();
};
