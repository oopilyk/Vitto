/**
 * Guess the country -- a hot-and-cold game over the globe.
 *
 * Each round hides one country. Every wrong guess answers with how far away it
 * was and which way to look, so the player triangulates rather than lists. Two
 * misses reveal the continent, four reveal the flag, and the answer is shown
 * either way once the round ends.
 */
import { COUNTRIES, type Country } from '../data/countries';
import type { BrainTrainingMetadata, CountryGuessRoundOutcome } from './health';

export const COUNTRY_GUESS_ROUNDS = 3;
export const COUNTRY_GUESS_MAX_GUESSES = 6;
/** Misses before the continent, then the flag, are shown. */
export const COUNTRY_GUESS_CONTINENT_HINT_AT = 2;
export const COUNTRY_GUESS_FLAG_HINT_AT = 4;
/** Half the Earth's circumference: nothing on the planet is further than this. */
const FURTHEST_KM = 20000;
const EARTH_RADIUS_KM = 6371;

export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface CountryGuessFeedback {
  country: Country;
  correct: boolean;
  distanceKm: number;
  /** From the guess towards the answer. */
  direction: CompassDirection;
  /** 0 on the far side of the world, 100 on the spot. */
  proximity: number;
}

export interface CountryGuessSession {
  /** The answers, in play order. */
  targets: Country[];
}

type Rng = () => number;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance, to the nearest kilometre. */
export const distanceBetween = (a: Pick<Country, 'lat' | 'lon'>, b: Pick<Country, 'lat' | 'lon'>): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
};

/** Initial bearing from `from` to `to`, in degrees clockwise from north, 0..360. */
export const bearingBetween = (from: Pick<Country, 'lat' | 'lon'>, to: Pick<Country, 'lat' | 'lon'>): number => {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLon = toRadians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return (degrees + 360) % 360;
};

const DIRECTIONS: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const compassDirection = (bearing: number): CompassDirection =>
  DIRECTIONS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;

export const DIRECTION_ARROWS: Record<CompassDirection, string> = {
  N: '↑',
  NE: '↗',
  E: '→',
  SE: '↘',
  S: '↓',
  SW: '↙',
  W: '←',
  NW: '↖',
};

/** Regional-indicator pair, which every modern platform renders as the flag. */
export const flagEmoji = (code: string): string =>
  code
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');

/** Lower case, accents stripped, punctuation gone: "Côte d'Ivoire" and "cote divoire" agree. */
const normalise = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const namesOf = (country: Country): string[] => [country.name, ...(country.aliases ?? [])].map(normalise);

export const findCountry = (entry: string): Country | null => {
  const wanted = normalise(entry);
  if (!wanted) return null;
  return COUNTRIES.find((country) => namesOf(country).includes(wanted)) ?? null;
};

export const countryByCode = (code: string): Country | null =>
  COUNTRIES.find((country) => country.code === code.toUpperCase()) ?? null;

/**
 * Suggestions for a partly typed name. Names that start with the text come first,
 * then names that merely contain it, so "an" lists Angola before France.
 */
export const searchCountries = (entry: string, limit = 6): Country[] => {
  const wanted = normalise(entry);
  if (!wanted) return [];
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const country of COUNTRIES) {
    const names = namesOf(country);
    if (names.some((name) => name.startsWith(wanted))) starts.push(country);
    else if (names.some((name) => name.includes(wanted))) contains.push(country);
  }
  return [...starts, ...contains].slice(0, limit);
};

export const generateCountryGuessSession = (rng: Rng = Math.random, avoidCodes: readonly string[] = []): CountryGuessSession => {
  const pool = COUNTRIES.filter((country) => !avoidCodes.includes(country.code));
  const targets: Country[] = [];
  const candidates = pool.length >= COUNTRY_GUESS_ROUNDS ? [...pool] : [...COUNTRIES];
  while (targets.length < COUNTRY_GUESS_ROUNDS && candidates.length > 0) {
    const index = Math.floor(rng() * candidates.length);
    targets.push(candidates[index]!);
    candidates.splice(index, 1);
  }
  return { targets };
};

export const judgeCountryGuess = (guess: Country, target: Country): CountryGuessFeedback => {
  if (guess.code === target.code) {
    return { country: guess, correct: true, distanceKm: 0, direction: 'N', proximity: 100 };
  }
  const distanceKm = distanceBetween(guess, target);
  return {
    country: guess,
    correct: false,
    distanceKm,
    direction: compassDirection(bearingBetween(guess, target)),
    proximity: Math.max(0, Math.min(100, Math.round(100 * (1 - distanceKm / FURTHEST_KM)))),
  };
};

export const formatDistance = (km: number): string =>
  `${Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;

// ---------------------------------------------------------------------------
// Scoring. A round is worth a third of the total, and each guess spent costs a
// little; even a last-guess solve keeps ten points, since a solve is a solve.
// ---------------------------------------------------------------------------

const ROUND_MAX_POINTS = 34;
const POINTS_PER_GUESS = 5;
const ROUND_MIN_POINTS = 10;

export const countryGuessRoundPoints = ({ solved, guessesUsed }: Pick<CountryGuessRoundOutcome, 'solved' | 'guessesUsed'>): number => {
  if (!solved) return 0;
  return Math.max(ROUND_MIN_POINTS, ROUND_MAX_POINTS - (Math.max(1, guessesUsed) - 1) * POINTS_PER_GUESS);
};

export const countryGuessScore = (outcomes: readonly CountryGuessRoundOutcome[]): number =>
  Math.max(0, Math.min(100, outcomes.reduce((sum, outcome) => sum + countryGuessRoundPoints(outcome), 0)));

export const toCountryGuessMetadata = (
  outcomes: readonly CountryGuessRoundOutcome[],
  durationSeconds: number,
): BrainTrainingMetadata => ({
  game: 'countryGuess',
  correct: outcomes.filter((outcome) => outcome.solved).length,
  total: COUNTRY_GUESS_ROUNDS,
  durationSeconds,
  score: countryGuessScore(outcomes),
  countryOutcomes: outcomes.map(({ code, solved, guessesUsed }) => ({ code, solved, guessesUsed })),
});
