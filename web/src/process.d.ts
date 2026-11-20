/**
 * `process` as the shared package reads it (packages/core's decayClock checks
 * `typeof process` before touching it). Vite has no Node types, so without
 * this the web type check fails on that one read.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;
