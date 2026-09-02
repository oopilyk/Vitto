export type BrainGameKind = 'math' | 'reading' | 'wordPuzzle';

/**
 * The timed games. WordPuzzle is untimed, so pace scoring is meaningless for it and
 * it is deliberately excluded here rather than left to convention.
 */
export type PacedBrainGameKind = Exclude<BrainGameKind, 'wordPuzzle'>;

export interface MathProblem {
  id: string;
  prompt: string;
  answer: number;
  tier: number;
}

export interface ReadingQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
}

export interface ReadingPassage {
  id: string;
  title: string;
  body: string;
  questions: ReadingQuestion[];
}

export interface BrainSessionResult {
  game: BrainGameKind;
  correct: number;
  total: number;
  durationSeconds: number;
}

/** A session {@link mindScore} can score: the untimed games are not scored on pace. */
export interface PacedBrainSessionResult extends BrainSessionResult {
  game: PacedBrainGameKind;
}

export const MATH_ROUND_SECONDS = 60;
export const MAX_TIER = 5;
const ANSWERS_PER_TIER = 3;

type Rng = () => number;

const int = (rng: Rng, minimum: number, maximum: number) =>
  minimum + Math.floor(rng() * (maximum - minimum + 1));

const pick = <T,>(rng: Rng, options: T[]): T => options[int(rng, 0, options.length - 1)];

/** Each tier is a harder shape of problem; the round climbs as answers land. */
const TIER_BUILDERS: ((rng: Rng) => { prompt: string; answer: number })[] = [
  (rng) => {
    const a = int(rng, 12, 89);
    const b = int(rng, 6, 49);
    return rng() < 0.5
      ? { prompt: `${a} + ${b}`, answer: a + b }
      : { prompt: `${a + b} \u2212 ${b}`, answer: a };
  },
  (rng) => {
    const a = int(rng, 3, 12);
    const b = int(rng, 4, 19);
    return rng() < 0.5
      ? { prompt: `${a} \u00d7 ${b}`, answer: a * b }
      : { prompt: `${a * b} \u00f7 ${a}`, answer: b };
  },
  (rng) => {
    const a = int(rng, 3, 12);
    const b = int(rng, 3, 9);
    const c = int(rng, 7, 40);
    return rng() < 0.5
      ? { prompt: `${a} \u00d7 ${b} + ${c}`, answer: a * b + c }
      : { prompt: `${a * b + c} \u2212 ${a} \u00d7 ${b}`, answer: c };
  },
  (rng) => {
    if (rng() < 0.5) {
      const percent = pick(rng, [5, 10, 15, 20, 25, 40, 60, 75]);
      const base = int(rng, 4, 24) * 20;
      return { prompt: `${percent}% of ${base}`, answer: (base * percent) / 100 };
    }
    const quarters = pick(rng, [2, 3]);
    const whole = int(rng, 3, 16) * 4;
    return { prompt: `${quarters}/4 of ${whole}`, answer: (whole / 4) * quarters };
  },
  (rng) => {
    if (rng() < 0.5) {
      const a = int(rng, 11, 29);
      const b = int(rng, 11, 19);
      return { prompt: `${a} \u00d7 ${b}`, answer: a * b };
    }
    const a = int(rng, 11, 29);
    const c = int(rng, 5, 30);
    const multiplier = pick(rng, [3, 4, 6]);
    return { prompt: `(${a} + ${c}) \u00d7 ${multiplier}`, answer: (a + c) * multiplier };
  },
];

/** Three correct answers in a row unlocks the next tier, capped at {@link MAX_TIER}. */
export const tierForStreak = (streak: number): number =>
  Math.min(MAX_TIER, 1 + Math.floor(Math.max(0, streak) / ANSWERS_PER_TIER));

export const generateMathProblem = (streak: number, rng: Rng = Math.random): MathProblem => {
  const tier = tierForStreak(streak);
  const { prompt, answer } = TIER_BUILDERS[tier - 1](rng);
  return { id: `${tier}-${prompt}-${Math.floor(rng() * 1e9)}`, prompt, answer, tier };
};

export const readingPassages: ReadingPassage[] = [
  {
    id: 'sleep-pressure',
    title: 'Why the afternoon slump is real',
    body:
      'Your body runs two clocks at once. The first is sleep pressure: a molecule called adenosine builds up in the brain from the moment you wake, and the longer you are awake, the heavier it presses. The second is the circadian rhythm, a roughly 24-hour wave set largely by light, which pushes alertness up and down on its own schedule.\n\nEarly in the afternoon those two clocks briefly work against each other. Adenosine has been accumulating for six or seven hours, while the circadian wave dips before rising again toward evening. The result is a slump that has nothing to do with lunch, though a heavy meal can deepen it.\n\nCaffeine works by blocking adenosine from docking at its receptors. It does not remove the pressure; it hides it. When the caffeine clears, the adenosine that built up in the meantime is still waiting, which is why a late coffee can turn one tired afternoon into a poor night and a worse morning.',
    questions: [
      {
        id: 'sleep-1',
        prompt: 'What causes the afternoon slump, according to the passage?',
        options: [
          'A heavy lunch slowing digestion',
          'Sleep pressure building while the circadian rhythm dips',
          'A drop in blood sugar after eating',
          'Adenosine being cleared too quickly',
        ],
        answerIndex: 1,
      },
      {
        id: 'sleep-2',
        prompt: 'How does caffeine affect adenosine?',
        options: [
          'It breaks adenosine down into smaller molecules',
          'It stops the body producing adenosine',
          'It blocks adenosine from reaching its receptors',
          'It converts adenosine into usable energy',
        ],
        answerIndex: 2,
      },
      {
        id: 'sleep-3',
        prompt: 'Why can a late coffee lead to a worse morning?',
        options: [
          'The adenosine that accumulated is still waiting once caffeine clears',
          'Caffeine permanently resets the circadian rhythm',
          'It causes the body to produce extra adenosine overnight',
          'It removes the afternoon dip entirely',
        ],
        answerIndex: 0,
      },
    ],
  },
  {
    id: 'zone-two',
    title: 'The case for training slowly',
    body:
      'Endurance athletes spend a surprising share of their training going easy. A common pattern is roughly eighty per cent of sessions at a conversational pace and twenty per cent hard, an approach usually called polarised training. The easy work is not filler. It is where the body builds the machinery that makes hard work possible.\n\nAt low intensities, muscles rely mainly on fat for fuel and lean on slow-twitch fibres, which are dense with mitochondria. Training in that range increases both the number and the efficiency of those mitochondria, and grows the fine network of capillaries feeding the muscle. Those adaptations raise the ceiling at which lactate begins to accumulate faster than the body can clear it.\n\nThe trap is the middle. Sessions run at a moderately hard pace feel productive and leave real fatigue, but they are too intense to build the aerobic base and too easy to drive top-end power. Athletes who live there often plateau while training more than ever.',
    questions: [
      {
        id: 'zone-1',
        prompt: 'What does polarised training describe?',
        options: [
          'Alternating strength and cardio days',
          'Mostly easy sessions with a small share of hard ones',
          'Training only at a moderately hard pace',
          'Splitting sessions evenly between easy and hard',
        ],
        answerIndex: 1,
      },
      {
        id: 'zone-2',
        prompt: 'What adaptation does easy training drive, per the passage?',
        options: [
          'Larger fast-twitch fibres',
          'Higher resting heart rate',
          'More and more efficient mitochondria, plus capillary growth',
          'Faster glycogen storage after meals',
        ],
        answerIndex: 2,
      },
      {
        id: 'zone-3',
        prompt: 'Why is the moderate middle described as a trap?',
        options: [
          'It is too intense to build the aerobic base and too easy to build top-end power',
          'It burns fat instead of carbohydrate',
          'It cannot be sustained for more than a few minutes',
          'It only suits elite athletes',
        ],
        answerIndex: 0,
      },
    ],
  },
  {
    id: 'habit-loop',
    title: 'How a habit actually forms',
    body:
      'A habit is best understood as a loop with three parts: a cue that triggers the behaviour, the routine itself, and a reward that tells the brain the loop was worth repeating. With enough repetition the striatum begins running the sequence with little conscious input, which is why you can drive a familiar route and remember almost nothing of it.\n\nThis is why willpower is a poor tool for change. Willpower fights the routine in the middle of the loop, at the exact moment the cue has already fired and the reward is anticipated. Redesigning the cue is far cheaper. Leaving running shoes by the door or keeping the phone out of the bedroom changes which loop starts in the first place.\n\nResearch on habit formation also punctures a popular myth. The often-quoted twenty-one days comes from a surgeon’s observations about patients adjusting to amputation, not from a study of habits. When behaviour change was actually measured, the average was closer to sixty-six days, with enormous variation between people and behaviours.',
    questions: [
      {
        id: 'habit-1',
        prompt: 'What are the three parts of the habit loop?',
        options: [
          'Intention, effort, and reflection',
          'Cue, routine, and reward',
          'Trigger, willpower, and streak',
          'Goal, plan, and review',
        ],
        answerIndex: 1,
      },
      {
        id: 'habit-2',
        prompt: 'Why does the passage argue willpower is a poor tool?',
        options: [
          'It is a finite resource that runs out daily',
          'It only works for physical habits',
          'It fights the routine after the cue has already fired',
          'It weakens the reward the brain expects',
        ],
        answerIndex: 2,
      },
      {
        id: 'habit-3',
        prompt: 'What does the passage say about the twenty-one day rule?',
        options: [
          'It came from observations of surgical patients, not habit research',
          'It applies only to exercise habits',
          'It was confirmed by later studies averaging sixty-six days',
          'It describes how long a cue takes to form',
        ],
        answerIndex: 0,
      },
    ],
  },
  {
    id: 'protein-timing',
    title: 'The anabolic window that mostly is not',
    body:
      'For years, gym advice held that a protein shake had to be swallowed within thirty minutes of the last set or the session was wasted. The idea rested on studies showing that muscle protein synthesis rises sharply after training and that amino acids delivered nearby amplify it.\n\nThe effect is real, but the window turned out to be a door left open far longer than anyone thought. Muscle protein synthesis stays elevated for at least twenty-four hours after a hard session, and remains sensitive to protein for much of that time. When researchers controlled for how much protein people ate across the whole day, the timing advantage largely disappeared.\n\nWhat does hold up is total daily intake, spread reasonably evenly. Most reviews land near 1.6 grams of protein per kilogram of body weight per day for people training seriously, with little further benefit past roughly 2.2. Distributing that across three or four meals beats loading it all into one, mostly because each feeding gives the synthesis machinery another prompt.',
    questions: [
      {
        id: 'protein-1',
        prompt: 'What happened to the timing advantage in controlled research?',
        options: [
          'It doubled when total intake was matched',
          'It largely disappeared once total daily protein was accounted for',
          'It only applied to endurance athletes',
          'It proved larger than first thought',
        ],
        answerIndex: 1,
      },
      {
        id: 'protein-2',
        prompt: 'How long does muscle protein synthesis stay elevated after a hard session?',
        options: ['About thirty minutes', 'Two to three hours', 'At least twenty-four hours', 'Roughly a week'],
        answerIndex: 2,
      },
      {
        id: 'protein-3',
        prompt: 'What does the passage say matters most?',
        options: [
          'Total daily protein, spread reasonably evenly',
          'Taking protein within thirty minutes of training',
          'Eating all protein in a single large meal',
          'Exceeding 2.2 grams per kilogram every day',
        ],
        answerIndex: 0,
      },
    ],
  },
];

export const pickReadingPassage = (
  excludeId?: string,
  rng: Rng = Math.random,
): ReadingPassage => {
  const choices = readingPassages.filter((passage) => passage.id !== excludeId);
  const pool = choices.length ? choices : readingPassages;
  return pool[int(rng, 0, pool.length - 1)];
};

/** Answers per minute that earn the full pace bonus, per game. */
const PACE_CEILING: Record<PacedBrainGameKind, number> = { math: 12, reading: 3 };

/**
 * A 0-100 read on the session: accuracy carries most of it, and the pace bonus is
 * itself scaled by accuracy so that answering fast and wrong never scores well.
 */
export const mindScore = ({ game, correct, total, durationSeconds }: PacedBrainSessionResult): number => {
  if (total <= 0) return 0;
  const accuracy = Math.max(0, Math.min(1, correct / total));
  const minutes = Math.max(1 / 60, durationSeconds / 60);
  const pace = Math.min(1, correct / minutes / PACE_CEILING[game]);
  return Math.round(accuracy * 80 + accuracy * pace * 20);
};

export const mindScoreLabel = (score: number): string => {
  if (score >= 90) return 'Razor sharp';
  if (score >= 75) return 'Focused';
  if (score >= 55) return 'Warmed up';
  if (score > 0) return 'Foggy';
  return 'Not started';
};
