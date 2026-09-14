import type { BrainTrainingMetadata } from '@vitto/core';
import { MIND_GAMES } from '../mind/registry';
import { availableMindGames, featuredMindGame, isMindGamePlayed } from '../mind/hub';
import type { MindGameEntry } from '../mind/types';

const played = (...ids: BrainTrainingMetadata['game'][]) => new Set(ids);

const entry = (overrides: Partial<MindGameEntry> & Pick<MindGameEntry, 'id'>): MindGameEntry => ({
  name: overrides.id,
  blurb: 'A game.',
  category: 'LOGIC',
  minutes: 2,
  maxXp: 20,
  hasPoints: false,
  launch: { kind: 'stage', stage: 'math' },
  playedAs: ['math'],
  ...overrides,
});

describe('isMindGamePlayed', () => {
  it('reads a game as played when today holds an event under its own id', () => {
    // Arrange
    const garden = MIND_GAMES.find((game) => game.id === 'wordGarden')!;

    // Act / Assert
    expect(isMindGamePlayed(garden, played('wordGarden'))).toBe(true);
  });

  it('still reads the word garden as played under its former spellingBee id', () => {
    // Arrange
    const garden = MIND_GAMES.find((game) => game.id === 'wordGarden')!;

    // Act / Assert
    expect(isMindGamePlayed(garden, played('spellingBee'))).toBe(true);
  });

  it('reads a game as unplayed when only other games were played today', () => {
    // Arrange
    const garden = MIND_GAMES.find((game) => game.id === 'wordGarden')!;

    // Act / Assert
    expect(isMindGamePlayed(garden, played('math', 'reading'))).toBe(false);
  });
});

describe('availableMindGames', () => {
  it('keeps every stage game, which the hub can always start itself', () => {
    // Arrange / Act
    const available = availableMindGames(MIND_GAMES, {});

    // Assert
    expect(available.map((game) => game.id)).toEqual([
      'wordGarden',
      'countryGuess',
      'math',
      'reading',
    ]);
  });

  it('adds a route game only once its route is actually wired up', () => {
    // Arrange / Act
    const available = availableMindGames(MIND_GAMES, { fourCorners: () => {} });

    // Assert
    expect(available.some((game) => game.id === 'fourCorners')).toBe(true);
    expect(available.some((game) => game.id === 'petJeopardy')).toBe(false);
  });

  it('preserves the registry order rather than grouping routes and stages', () => {
    // Arrange / Act
    const available = availableMindGames(MIND_GAMES, {
      fourCorners: () => {},
      petJeopardy: () => {},
      wordPuzzle: () => {},
    });

    // Assert
    expect(available.map((game) => game.id)).toEqual(MIND_GAMES.map((game) => game.id));
  });
});

describe('featuredMindGame', () => {
  const roster = [
    entry({ id: 'a', playedAs: ['math'] }),
    entry({ id: 'b', playedAs: ['reading'] }),
    entry({ id: 'c', playedAs: ['countryGuess'] }),
  ];

  it('picks the same game all day for a given day', () => {
    // Arrange / Act
    const first = featuredMindGame(roster, '2026-09-13', played());
    const second = featuredMindGame(roster, '2026-09-13', played());

    // Assert
    expect(first).toBe(second);
  });

  it('moves the feature on as the date changes rather than pinning one game forever', () => {
    // Arrange
    const week = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'];

    // Act
    const featured = new Set(week.map((dayKey) => featuredMindGame(roster, dayKey, played())?.id));

    // Assert
    expect(featured.size).toBeGreaterThan(1);
  });

  it('skips past a game already played today to something still unplayed', () => {
    // Arrange
    const pinned = featuredMindGame(roster, '2026-09-13', played())!;

    // Act
    const next = featuredMindGame(roster, '2026-09-13', played(...pinned.playedAs));

    // Assert
    expect(next).not.toBe(pinned);
    expect(next).not.toBeNull();
  });

  it('falls back to the day s own pick once every game has been played', () => {
    // Arrange
    const allPlayed = played('math', 'reading', 'countryGuess');

    // Act
    const featured = featuredMindGame(roster, '2026-09-13', allPlayed);

    // Assert
    expect(featured).toBe(featuredMindGame(roster, '2026-09-13', played()));
  });

  it('has nothing to feature when there are no games', () => {
    // Arrange / Act / Assert
    expect(featuredMindGame([], '2026-09-13', played())).toBeNull();
  });
});
