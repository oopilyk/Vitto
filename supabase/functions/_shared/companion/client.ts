// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/client.ts
// Regenerate with: node scripts/syncCompanion.mjs

/**
 * The companion as the app sees it: everything in ./index except the prompts.
 *
 * The prompts are the model's instructions and are only ever used by the
 * `companion` edge function (its own copy, see scripts/syncCompanion.mjs). They
 * quote the profanity a foul-mouthed pet may use, and anything exported here
 * lands in the app bundle, where App Review reads the strings. So the app's
 * `companion` export (src/index.ts) is this file, not ./index.
 */
export * from './types.ts';
export * from './util.ts';
export * from './personality.ts';
export * from './mood.ts';
export * from './relationship.ts';
export * from './memory.ts';
export * from './patterns.ts';
export * from './triggers.ts';
export * from './events.ts';
export * from './context.ts';
export * from './entitlements.ts';
export * from './mock.ts';
export * from './pushLines.ts';
export * from './proposals.ts';
export * from './liftMath.ts';
