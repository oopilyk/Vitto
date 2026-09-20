#!/usr/bin/env node
/**
 * syncCompanion.mjs
 *
 * Generates the Supabase edge function's copy of the AI companion logic.
 *
 * The companion's character logic (personality drift, mood, relationship, memory
 * ranking, prompts, proactive triggers) is authored once, in
 * `packages/core/src/companion`, where vitest covers it. It also has to run
 * inside the `companion` edge function — that is where the Claude calls and all
 * state changes happen, so the API key never reaches a phone and the usage caps
 * cannot be bypassed.
 *
 * The function cannot import core directly: edge functions run on Deno, which
 * requires explicit file extensions, and core is written with the extensionless
 * imports a bundler resolves. So this copies the folder across and rewrites
 * `from './x'` to `from './x.ts'`. Nothing else changes — the folder has a closed
 * import graph for exactly this reason.
 *
 *   node scripts/syncCompanion.mjs           regenerate
 *   node scripts/syncCompanion.mjs --check   exit 1 if the copy is stale (CI / tests)
 *
 * DO NOT edit the generated files; edit core and re-run this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages/core/src/companion');
const target = path.join(root, 'supabase/functions/_shared/companion');

const banner = (file) =>
  `// GENERATED FILE -- DO NOT EDIT BY HAND.\n// Source: packages/core/src/companion/${file}\n// Regenerate with: node scripts/syncCompanion.mjs\n\n`;

/** `from './x'` -> `from './x.ts'`, for relative specifiers that have no extension yet. */
const withExtensions = (code) =>
  code.replace(/(\bfrom\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (match, open, spec, close) =>
    /\.[a-z]+$/i.test(spec) ? match : `${open}${spec}.ts${close}`,
  );

export const generate = () => {
  const files = fs.readdirSync(source).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts')).sort();
  return new Map(files.map((file) => [file, banner(file) + withExtensions(fs.readFileSync(path.join(source, file), 'utf8'))]));
};

/** Names of generated files that are missing, stale, or no longer have a source. */
export const stale = () => {
  const expected = generate();
  const out = [];
  for (const [file, code] of expected) {
    const existing = path.join(target, file);
    if (!fs.existsSync(existing) || fs.readFileSync(existing, 'utf8') !== code) out.push(file);
  }
  if (fs.existsSync(target)) {
    for (const file of fs.readdirSync(target)) if (file.endsWith('.ts') && !expected.has(file)) out.push(`${file} (orphan)`);
  }
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const drift = stale();
    if (drift.length) {
      console.error(`supabase/functions/_shared/companion is stale:\n  ${drift.join('\n  ')}\nRun: node scripts/syncCompanion.mjs`);
      process.exit(1);
    }
    console.log('companion copy is up to date');
  } else {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    const files = generate();
    for (const [file, code] of files) fs.writeFileSync(path.join(target, file), code);
    console.log(`wrote ${files.size} files to ${path.relative(root, target)}`);
  }
}
