import { describe, expect, it } from 'vitest';
import {
  MAX_TIER,
  generateMathProblem,
  mindScore,
  mindScoreLabel,
  pickReadingPassage,
  readingPassages,
  tierForStreak,
} from './brainGames';

// Walks the whole generator space rather than trusting one lucky draw.
const seededRng = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const evaluate = (prompt: string): number => {
  const percent = prompt.match(/^(\d+)% of (\d+)$/);
  if (percent) return (Number(percent[2]) * Number(percent[1])) / 100;
  const fraction = prompt.match(/^(\d+)\/4 of (\d+)$/);
  if (fraction) return (Number(fraction[2]) / 4) * Number(fraction[1]);
  const expression = prompt.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  return Function(`"use strict"; return (${expression});`)() as number;
};

describe('generateMathProblem', () => {
  it('always states an answer that matches its own prompt', () => {
    const rng = seededRng(7);
    for (let streak = 0; streak < 60; streak += 1) {
      const problem = generateMathProblem(streak, rng);
      expect(evaluate(problem.prompt)).toBe(problem.answer);
      expect(Number.isInteger(problem.answer)).toBe(true);
    }
  });

  it('climbs a tier every three correct answers and stops at the ceiling', () => {
    expect(tierForStreak(0)).toBe(1);
    expect(tierForStreak(2)).toBe(1);
    expect(tierForStreak(3)).toBe(2);
    expect(tierForStreak(99)).toBe(MAX_TIER);
  });
});

describe('readingPassages', () => {
  it('gives every question exactly one answer that is in range', () => {
    for (const passage of readingPassages) {
      expect(passage.questions.length).toBeGreaterThan(0);
      for (const question of passage.questions) {
        expect(question.options.length).toBeGreaterThan(1);
        expect(question.answerIndex).toBeGreaterThanOrEqual(0);
        expect(question.answerIndex).toBeLessThan(question.options.length);
        expect(new Set(question.options).size).toBe(question.options.length);
      }
    }
  });

  it('does not hand back the passage just read', () => {
    for (const passage of readingPassages) {
      expect(pickReadingPassage(passage.id, seededRng(3)).id).not.toBe(passage.id);
    }
  });
});

describe('mindScore', () => {
  it('rewards accuracy first', () => {
    const fast = mindScore({ game: 'math', correct: 4, total: 8, durationSeconds: 60 });
    const perfect = mindScore({ game: 'math', correct: 8, total: 8, durationSeconds: 60 });
    expect(perfect).toBeGreaterThan(fast);
    expect(perfect).toBeLessThanOrEqual(100);
  });

  it('never rewards answering quickly but wrongly', () => {
    expect(mindScore({ game: 'math', correct: 0, total: 20, durationSeconds: 10 })).toBe(0);
  });

  it('returns zero for an empty session', () => {
    expect(mindScore({ game: 'reading', correct: 0, total: 0, durationSeconds: 30 })).toBe(0);
    expect(mindScoreLabel(0)).toBe('Not started');
  });
});
