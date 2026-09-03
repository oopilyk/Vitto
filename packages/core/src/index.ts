// The shared heart of Vitto: pure domain logic plus the services that only need a
// Supabase client, which each app injects through `configureCore`.
export * from './domain/health';
export * from './domain/pet';
export * from './domain/petHealthEngine';
export * from './domain/strengthProgression';
export * from './domain/petStats';
export * from './domain/decay';
export * from './domain/devAccess';
export * from './domain/petCondition';
export * from './domain/streaks';
export * from './domain/macros';
export * from './domain/macroTargets';
export * from './domain/nutritionSummary';
export * from './domain/brainGames';
export * from './domain/wordPuzzle';
export * from './domain/workout';
export * from './domain/ids';
export * from './config';
export * from './errorMessage';
export * from './foodDatabase';
export * from './data/wordPuzzleWords';
export * from './auth';
export * from './supabaseRepository';
