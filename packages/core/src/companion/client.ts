/**
 * The companion as the app sees it: everything in ./index except the prompts.
 *
 * The prompts are the model's instructions and are only ever used by the
 * `companion` edge function (its own copy, see scripts/syncCompanion.mjs). They
 * quote the profanity a foul-mouthed pet may use, and anything exported here
 * lands in the app bundle, where App Review reads the strings. So the app's
 * `companion` export (src/index.ts) is this file, not ./index.
 */
export * from './types';
export * from './util';
export * from './personality';
export * from './mood';
export * from './relationship';
export * from './memory';
export * from './patterns';
export * from './triggers';
export * from './events';
export * from './context';
export * from './entitlements';
export * from './mock';
export * from './pushLines';
export * from './proposals';
export * from './liftMath';
