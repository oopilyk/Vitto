import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEALTH_EVENT_TYPES } from './health';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations');

/**
 * `pet_care_log.type` carries a CHECK constraint listing every health event
 * type. A type the database has not been told about would make the care-log
 * insert fail for that event — silently, since the insert is best effort — and
 * the partner would simply never see those moments. Reading the migration back
 * turns that drift into a failing test at the moment the type is added.
 */
const careLogTypesInLatestMigration = (): string[] => {
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
    // Anchor to the pet_care_log table itself, so a type CHECK on some other
    // table in a later migration cannot redirect this test.
    const tableStart = statement.search(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.pet_care_log\s*\(/i);
    if (tableStart === -1) continue;
    const tableEnd = statement.indexOf('\n);', tableStart);
    const table = statement.slice(tableStart, tableEnd === -1 ? undefined : tableEnd);
    const match = table.match(/check\s*\(\s*type\s+in\s*\(([^)]*)\)/i);
    if (match) return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  throw new Error('no migration defines the pet_care_log.type check constraint');
};

describe('pet_care_log.type check constraint', () => {
  it('allows exactly HEALTH_EVENT_TYPES, in the same order', () => {
    expect(careLogTypesInLatestMigration()).toEqual([...HEALTH_EVENT_TYPES]);
  });
});
