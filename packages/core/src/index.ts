// The shared heart of Vitto: pure domain logic plus the services that only need a
// Supabase client, which each app injects through `configureCore`.
export * from './domain/careToast';
export * from './domain/trophies';
export * from './domain/achievements';
export * from './domain/workoutTemplates';
export * from './domain/foodEffects';
export * from './domain/health';
export * from './domain/pet';
export * from './domain/friends';
export * from './domain/friendRequests';
export * from './domain/petHealthEngine';
export * from './domain/strengthProgression';
export * from './domain/personalRecords';
export * from './domain/runRecords';
export * from './domain/strengthStandards';
export * from './domain/petVoice';
export * from './domain/bond';
export * from './domain/petStats';
export * from './domain/decay';
export * from './domain/devAccess';
export * from './domain/petCondition';
export * from './domain/petStatusEffects';
export * from './domain/socialPetStatus';
export * from './domain/screenTime';
export * from './domain/ambient';
export * from './domain/reminders';
export * from './domain/streaks';
export * from './domain/insights';
export * from './dev/seedEvents';
export * from './domain/macros';
export * from './domain/mealAnalysis';
export * from './domain/macroTargets';
export * from './domain/onboarding';
export * from './domain/nutritionSummary';
export * from './domain/dailyRecap';
export * from './domain/brainGames';
export * from './domain/mathRun';
export * from './domain/wordPuzzle';
export * from './domain/wordGarden';
export * from './domain/countryGuess';
export * from './domain/fourCorners';
export * from './domain/petJeopardy';
export * from './domain/workout';
export * from './domain/carePartners';
export * from './domain/ids';
export * from './config';
export * from './errorMessage';
export * from './foodDatabase';
export * from './data/wordPuzzleWords';
export * from './data/countries';
export * from './data/cheekyWords';
export * from './data/triviaQuestions';
export * from './data/jeopardyQuestions';
export * from './auth';
export * from './supabaseRepository';
export * from './domain/companionBridge';
/**
 * The AI companion, namespaced on purpose: it is a closed module that also runs
 * inside the Supabase edge function, and it has its own `clamp` and `WEEKDAYS`
 * that would collide with core's under a flat `export *`.
 */
export * as companion from './companion';
/** The dials are set on the pet by the app, so the type is reachable without the namespace. */
export type { PersonalityDials } from './companion/types';
