import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs build script, deliberately outside the package
import { stale } from '../../../../scripts/syncCompanion.mjs';

describe('the edge function copy of the companion', () => {
  it('matches this folder exactly', () => {
    // The Claude calls run in a Supabase edge function, which is Deno and cannot
    // import core. It carries a generated copy instead. If this fails you edited
    // core without regenerating: run `node scripts/syncCompanion.mjs`.
    expect(stale()).toEqual([]);
  });
});
