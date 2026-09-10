import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../data/countries';
import {
  COUNTRY_GUESS_ROUNDS,
  compassDirection,
  countryByCode,
  countryGuessRoundPoints,
  countryGuessScore,
  distanceBetween,
  findCountry,
  flagEmoji,
  formatDistance,
  generateCountryGuessSession,
  judgeCountryGuess,
  searchCountries,
  toCountryGuessMetadata,
} from './countryGuess';

const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

describe('countries data', () => {
  it('has unique codes and names with coordinates on the globe', () => {
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((country) => country.name.toLowerCase())).size).toBe(COUNTRIES.length);
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(country.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(country.lon)).toBeLessThanOrEqual(180);
      expect(country.capital.length).toBeGreaterThan(0);
    }
  });
});

describe('finding countries', () => {
  it('matches names, aliases, accents and case loosely', () => {
    expect(findCountry('france')?.code).toBe('FR');
    expect(findCountry('USA')?.code).toBe('US');
    expect(findCountry("Côte d'Ivoire")?.code).toBe('CI');
    expect(findCountry('cote divoire')?.code).toBe('CI');
    expect(findCountry('Atlantis')).toBeNull();
    expect(findCountry('')).toBeNull();
    expect(countryByCode('jp')?.name).toBe('Japan');
  });

  it('suggests prefix matches before substring matches', () => {
    const names = searchCountries('an', 50).map((country) => country.name);
    expect(names[0]).toBe('Angola');
    expect(names).toContain('France');
    expect(names.indexOf('Angola')).toBeLessThan(names.indexOf('France'));
    expect(searchCountries('zzz')).toEqual([]);
    expect(searchCountries('a', 3)).toHaveLength(3);
  });
});

describe('judging a guess', () => {
  const france = findCountry('France')!;
  const spain = findCountry('Spain')!;
  const japan = findCountry('Japan')!;

  it('points from the guess towards the answer with a sensible distance', () => {
    const feedback = judgeCountryGuess(spain, france);
    expect(feedback.correct).toBe(false);
    expect(feedback.direction).toBe('NE');
    expect(feedback.distanceKm).toBeGreaterThan(500);
    expect(feedback.distanceKm).toBeLessThan(1200);
    expect(feedback.proximity).toBeGreaterThan(90);
    expect(judgeCountryGuess(france, spain).direction).toBe('SW');
  });

  it('flags a correct guess as on the spot', () => {
    const feedback = judgeCountryGuess(japan, japan);
    expect(feedback).toMatchObject({ correct: true, distanceKm: 0, proximity: 100 });
  });

  it('measures distance symmetrically and halfway round the world is far', () => {
    expect(distanceBetween(france, japan)).toBe(distanceBetween(japan, france));
    expect(distanceBetween(france, japan)).toBeGreaterThan(9000);
    expect(judgeCountryGuess(findCountry('New Zealand')!, spain).proximity).toBeLessThan(10);
  });

  it('turns bearings into the eight compass points', () => {
    expect(compassDirection(0)).toBe('N');
    expect(compassDirection(44)).toBe('NE');
    expect(compassDirection(180)).toBe('S');
    expect(compassDirection(359)).toBe('N');
    expect(compassDirection(-90)).toBe('W');
  });

  it('renders flags and distances for people', () => {
    expect(flagEmoji('fr')).toBe('🇫🇷');
    expect(formatDistance(12345)).toBe('12,345 km');
    expect(formatDistance(0)).toBe('0 km');
  });
});

describe('sessions and scoring', () => {
  it('draws distinct countries and honours the avoid list', () => {
    const first = generateCountryGuessSession(seededRng(1));
    expect(first.targets).toHaveLength(COUNTRY_GUESS_ROUNDS);
    expect(new Set(first.targets.map((country) => country.code)).size).toBe(COUNTRY_GUESS_ROUNDS);
    const codes = first.targets.map((country) => country.code);
    const second = generateCountryGuessSession(seededRng(1), codes);
    expect(second.targets.some((country) => codes.includes(country.code))).toBe(false);
  });

  it('pays for speed but always pays for a solve', () => {
    expect(countryGuessRoundPoints({ solved: true, guessesUsed: 1 })).toBe(34);
    expect(countryGuessRoundPoints({ solved: true, guessesUsed: 3 })).toBe(24);
    expect(countryGuessRoundPoints({ solved: true, guessesUsed: 6 })).toBe(10);
    expect(countryGuessRoundPoints({ solved: false, guessesUsed: 6 })).toBe(0);
    const perfect = [1, 1, 1].map((guessesUsed) => ({ code: 'FR', solved: true, guessesUsed }));
    expect(countryGuessScore(perfect)).toBe(100);
    expect(countryGuessScore([])).toBe(0);
  });

  it('records the session without leaking anything beyond the outcomes', () => {
    const metadata = toCountryGuessMetadata(
      [
        { code: 'FR', solved: true, guessesUsed: 2 },
        { code: 'JP', solved: false, guessesUsed: 6 },
        { code: 'BR', solved: true, guessesUsed: 6 },
      ],
      300,
    );
    expect(metadata).toEqual({
      game: 'countryGuess',
      correct: 2,
      total: 3,
      durationSeconds: 300,
      score: 39,
      countryOutcomes: [
        { code: 'FR', solved: true, guessesUsed: 2 },
        { code: 'JP', solved: false, guessesUsed: 6 },
        { code: 'BR', solved: true, guessesUsed: 6 },
      ],
    });
  });
});
