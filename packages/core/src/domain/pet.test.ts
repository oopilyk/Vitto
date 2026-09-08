import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PET_BREEDS } from './pet';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations');

/**
 * `pets.breed` carries a CHECK constraint, so a breed the database has not been
 * told about fails every write for that pet — not just the adoption. Worse, a
 * CHECK violation is not a missing-column error, so the repository's
 * drop-the-column-and-retry path rethrows it instead of degrading gracefully.
 *
 * This has already shipped twice: `orangeCat` and then `otter` were both added
 * as selectable pets without a migration, and the second one surfaced as a raw
 * "violates check constraint" banner when logging a meal. Reading the migration
 * back turns that into a failing test at the moment the breed is added.
 */
const allowedBreedsInLatestMigration = (): string[] => {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    // Only the constraint itself, never the explanatory comments above it.
    const statement = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const match = statement.match(/check\s*\(\s*breed\s+in\s*\(([^)]*)\)/i);
    if (match) return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  throw new Error('no migration defines the pets.breed check constraint');
};

describe('pets.breed check constraint', () => {
  it('allows exactly the breeds the app can adopt', () => {
    expect([...allowedBreedsInLatestMigration()].sort()).toEqual([...PET_BREEDS].sort());
  });
});
