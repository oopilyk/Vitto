/**
 * WordPuzzle wordlist build script.
 *
 * ############################################################################
 * # MANUAL SCRIPT -- DO NOT RUN IN CI.                                       #
 * # It downloads several megabytes from the public internet, and its output  #
 * # (src/data/wordPuzzleWords.ts) is committed. The committed data is the        #
 * # source of truth; regenerating it in CI would be both impossible (no      #
 * # network) and undesirable (the daily puzzle must be stable forever).      #
 * ############################################################################
 *
 * Run manually, then commit the regenerated data module:
 *   npm run build:word-puzzle-words --workspace @vitto/core
 *
 * Needs Node >= 22.6 (it is executed directly by node, which strips the types).
 * No build-tool dependency is added to @vitto/core for this.
 *
 * ---------------------------------------------------------------------------
 * SOURCES
 *
 *   ENABLE (enable1.txt), by Alan Beale et al. -- guess-validity lexicon.
 *     Public domain. ~172,800 entries.
 *
 *   12dicts 6.0.2 (3of6game.txt), by Alan Beale, wordlist.aspell.net --
 *     commonality signal used to derive the answer pool. Public domain; the
 *     package ReadMe states: "The 12dicts lists were compiled by Alan Beale.
 *     I explicitly release them to the public domain, but request
 *     acknowledgment of their use."  ==> ACKNOWLEDGED, here and in the header
 *     of the generated module.
 *
 *     Note: the same ReadMe carves out `2of12inf` and the `2+2+3` lists, whose
 *     dependency on AGID prevents their release into the public domain. This
 *     script does NOT read those files, and must not be changed to do so.
 *
 *   LDNOOBW (Shutterstock), CC-BY-4.0 -- offensive-term blocklist. NOT
 *     downloaded here: it is vendored, tiered and attributed in
 *     src/data/offensiveWords.fixture.txt, which is read at build time and
 *     retained as a test fixture.
 *
 * Deliberately NOT used: any list of a published puzzle's authored answer
 * sequence, and any wordlist whose licence cannot be traced to someone with
 * the right to grant it.
 * ---------------------------------------------------------------------------
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');
const CACHE_DIR = join(HERE, '.wordlist-cache');
const FIXTURE_PATH = join(PACKAGE_ROOT, 'src', 'data', 'offensiveWords.fixture.txt');
const OUTPUT_PATH = join(PACKAGE_ROOT, 'src', 'data', 'wordPuzzleWords.ts');

const ENABLE_URL = 'https://norvig.com/ngrams/enable1.txt';
const TWELVE_DICTS_URL = 'http://downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip';
const TWELVE_DICTS_GAME = 'International/3of6game.txt';
const TWELVE_DICTS_6OF12 = 'American/6of12.txt';

const WORD_LENGTHS = [4, 5, 6] as const;
type WordLength = (typeof WORD_LENGTHS)[number];

/**
 * Deterministic ASCII-ascending comparator.
 *
 * Explicitly NOT `Array.prototype.sort()` with no argument (which sorts by
 * UTF-16 code unit only as an implementation detail of stringifying) and
 * explicitly NOT `localeCompare` (locale-dependent, so the generated data
 * would differ between machines and the binary search would silently break).
 */
const byAsciiAscending = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

async function download(url: string, cacheName: string): Promise<Buffer> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, cacheName);
  if (existsSync(cached)) {
    console.log(`  cache hit  ${cacheName}`);
    return readFileSync(cached);
  }
  console.log(`  fetching   ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  writeFileSync(cached, body);
  return body;
}

/**
 * Minimal ZIP reader. Avoids both a third-party dependency and a shell-out to
 * `unzip`.
 *
 * Reads the central directory rather than walking local file headers: the
 * 12dicts archive is written with streamed entries, whose local headers carry
 * zero sizes and defer them to a trailing data descriptor. Only the central
 * directory has the sizes up front.
 */
function extractZipMember(zip: Buffer, memberName: string): string {
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;

  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: no end-of-central-directory record');

  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`Corrupt ZIP central directory at entry ${i}`);
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    if (name === memberName) {
      // The local header repeats the name and extra fields, at its own lengths.
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data.toString('utf8');
      if (method === 8) return inflateRawSync(data).toString('utf8');
      throw new Error(`Unsupported ZIP compression method ${method} for ${memberName}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP member not found: ${memberName}`);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** ENABLE is one lowercase word per line. */
function parseEnable(text: string): string[] {
  return text.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean);
}

/**
 * 12dicts annotation suffixes, per the 12dicts ReadMe:
 *   `$`  present in fewer than three of the six source dictionaries
 *   `&`  a British spelling of an American word, or vice versa
 *   `^`  one of a set of close spelling variants, none attested three times
 *   `+`  a "signature" word Beale added because it "ought to be" present
 *   `!`  a neologism -- and the ReadMe notes this category deliberately
 *        includes "sexual slang and ethnic slurs" that dictionaries omit
 *   `:`  an abbreviation written without a terminating period
 *
 * A word may carry more than one. We keep the bare word plus its flags so the
 * answer pool can be tightened by attestation strength; see COMMON_TIER_FLAGS.
 */
interface AnnotatedEntry {
  readonly word: string;
  readonly flags: string;
  readonly capitalised: boolean;
}

function parse12Dicts(text: string): AnnotatedEntry[] {
  const entries: AnnotatedEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([A-Za-z]+)([^A-Za-z]*)$/.exec(line);
    if (!match) continue; // multi-word or hyphenated: not applicable to this list
    const raw = match[1]!;
    entries.push({
      word: raw.toLowerCase(),
      flags: match[2]!,
      capitalised: raw !== raw.toLowerCase(),
    });
  }
  return entries;
}

/**
 * The answer pool is the intersection of two 12dicts commonality tiers, each
 * with its weak entries stripped by annotation. Both files are outside the
 * AGID caveat in the 12dicts ReadMe, so both are fully public domain.
 *
 * `3of6game` alone was the starting point but ran ~20% long and admitted too
 * many marginal words (foetus, turbot, aspic). Intersecting it with the much
 * stricter `6of12` -- words attested in 6 of 12 source dictionaries -- is the
 * tightening lever, and `6of12`'s `=` annotation is what makes it work: it
 * marks words that exist only as an inflection or an underived -ly/-ness/-er
 * form of a neighbouring entry, which are exactly the low-value answers.
 */

/** 3of6game: `$` under-attested, `&`/`^` spelling variants, `:` abbreviation.
 *  `!` is the neologism set, which the ReadMe warns holds slurs and sexual
 *  slang deliberately omitted from the source dictionaries. */
const GAME_EXCLUDED_FLAGS = ['$', '&', '^', '!', ':'] as const;

/** 6of12: `=` second-class (inflection or underived form), `#` variant/less
 *  preferred, `<`/`~`/`^`/`&` spelling variants, `:` abbreviation. */
const SIX_OF_12_EXCLUDED_FLAGS = ['=', '#', '<', '~', '^', '&', ':'] as const;

/** Words of one 12dicts list, minus entries carrying a disqualifying flag.
 *  Capitalised entries (proper nouns, abbreviations) are dropped outright. */
function commonalityTier(
  entries: readonly AnnotatedEntry[],
  excludedFlags: readonly string[],
): Set<string> {
  const tier = new Set<string>();
  for (const entry of entries) {
    if (entry.capitalised) continue;
    if (excludedFlags.some((flag) => entry.flags.includes(flag))) continue;
    tier.add(entry.word);
  }
  return tier;
}

// ---------------------------------------------------------------------------
// Offensive-term fixture
// ---------------------------------------------------------------------------

interface OffensiveTerms {
  readonly severe: ReadonlySet<string>;
  readonly mild: ReadonlySet<string>;
}

function parseOffensiveFixture(text: string): OffensiveTerms {
  const severe = new Set<string>();
  const mild = new Set<string>();
  let bucket: Set<string> | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '[severe]') { bucket = severe; continue; }
    if (line === '[mild]') { bucket = mild; continue; }
    if (/^\[.*\]$/.test(line)) throw new Error(`Unknown fixture section: ${line}`);
    if (!bucket) throw new Error(`Fixture term outside any section: ${line}`);
    bucket.add(line.toLowerCase());
  }
  if (severe.size === 0 || mild.size === 0) {
    throw new Error('Offensive fixture parsed to an empty tier -- refusing to build.');
  }
  // A term in [mild] wins over the same term in [severe].
  for (const term of mild) severe.delete(term);
  return { severe, mild };
}

// ---------------------------------------------------------------------------
// Fairness filters (answers only -- these words remain valid guesses)
// ---------------------------------------------------------------------------

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** CARTS is unfair when CART exists: the plural adds nothing but a letter. */
function isPluralOfAKnownWord(word: string, validity: ReadonlySet<string>): boolean {
  if (!word.endsWith('s')) return false;
  const singular = word.slice(0, -1);
  if (validity.has(singular)) return true;
  if (singular.endsWith('e') && validity.has(singular.slice(0, -1))) return true; // BOXES -> BOX
  return false;
}

/** 3of6game ships inflections, so stripping them is required, not optional. */
function isInflectionOfAKnownWord(word: string, validity: ReadonlySet<string>): boolean {
  const doubled = (stem: string): boolean =>
    stem.length >= 2 && stem.at(-1) === stem.at(-2) && validity.has(stem.slice(0, -1));

  if (word.endsWith('ed')) {
    const dropD = word.slice(0, -1);            // BAKED  -> BAKE
    const dropEd = word.slice(0, -2);           // WALKED -> WALK
    if (validity.has(dropD) || validity.has(dropEd) || doubled(dropEd)) return true;
    if (dropEd.endsWith('i') && validity.has(`${dropEd.slice(0, -1)}y`)) return true; // TRIED -> TRY
  }
  if (word.endsWith('ing')) {
    const dropIng = word.slice(0, -3);          // WALKING -> WALK
    if (validity.has(dropIng) || validity.has(`${dropIng}e`) || doubled(dropIng)) return true;
  }
  return false;
}

/**
 * Two shapes that are disproportionately unfair when the guess budget equals
 * the word length: a word crammed with distinct vowels leaves almost nothing
 * to deduce from, and a 4-letter word built from three of the same letter
 * gives a player almost no positional information.
 */
function hasUnfairShape(word: string): boolean {
  const distinctVowels = new Set([...word].filter((ch) => VOWELS.has(ch)));
  if (distinctVowels.size >= 4) return true;

  if (word.length === 4) {
    const counts = new Map<string, number>();
    for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    for (const count of counts.values()) if (count >= 3) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * One bit per word, most-significant-bit first, base64-encoded.
 *
 * This is also deliberately an obfuscation measure: the answer pool is a
 * subset of the validity list rather than a separate array, so there is no
 * answer file in the repo for anyone to grep for tomorrow's word.
 */
function encodeBitmask(flags: readonly boolean[]): string {
  const bytes = Buffer.alloc(Math.ceil(flags.length / 8));
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i]) bytes[i >> 3]! |= 0b1000_0000 >> (i & 7);
  }
  return bytes.toString('base64');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface LengthResult {
  readonly length: WordLength;
  readonly words: readonly string[];
  readonly answerFlags: readonly boolean[];
  readonly answerCount: number;
}

async function main(): Promise<void> {
  console.log('WordPuzzle wordlist build\n');

  console.log('Acquiring sources:');
  const enableRaw = (await download(ENABLE_URL, 'enable1.txt')).toString('utf8');
  const twelveDictsZip = await download(TWELVE_DICTS_URL, '12dicts-6.0.2.zip');
  const gameListRaw = extractZipMember(twelveDictsZip, TWELVE_DICTS_GAME);
  const sixOf12Raw = extractZipMember(twelveDictsZip, TWELVE_DICTS_6OF12);
  const fixtureRaw = readFileSync(FIXTURE_PATH, 'utf8');

  const offensive = parseOffensiveFixture(fixtureRaw);
  console.log(
    `\nOffensive fixture: ${offensive.severe.size} severe, ${offensive.mild.size} mild`,
  );

  // -- Validity list --------------------------------------------------------
  // ENABLE restricted to pure lowercase ASCII of playable length. The regex
  // drops accented, hyphenated and apostrophised entries by construction.
  const enableWords = parseEnable(enableRaw);
  const validity = new Set<string>();
  for (const word of enableWords) {
    if (/^[a-z]{4,6}$/.test(word) && !offensive.severe.has(word)) validity.add(word);
  }
  console.log(`ENABLE: ${enableWords.length} entries -> ${validity.size} valid guesses (4-6)`);

  // Stem lookups need the whole lexicon, not just playable lengths: CART is
  // four letters, CARTS is five, and BAKE/BAKED straddle the same boundary.
  const stemLookup = new Set(enableWords.filter((word) => /^[a-z]+$/.test(word)));

  // -- Answer-eligible pool -------------------------------------------------
  const gameTier = commonalityTier(parse12Dicts(gameListRaw), GAME_EXCLUDED_FLAGS);
  const sixOf12Tier = commonalityTier(parse12Dicts(sixOf12Raw), SIX_OF_12_EXCLUDED_FLAGS);
  const commonWords = new Set([...sixOf12Tier].filter((word) => gameTier.has(word)));
  console.log(
    `12dicts 3of6game: ${gameTier.size} entries after annotation filtering\n` +
      `12dicts 6of12   : ${sixOf12Tier.size} entries after annotation filtering\n` +
      `commonality tier: ${commonWords.size} (intersection)`,
  );

  const rejected = { notCommon: 0, plural: 0, inflection: 0, shape: 0, offensive: 0 };

  const results: LengthResult[] = WORD_LENGTHS.map((length) => {
    const words = [...validity].filter((word) => word.length === length).sort(byAsciiAscending);

    const answerFlags = words.map((word) => {
      if (!commonWords.has(word)) { rejected.notCommon += 1; return false; }
      if (offensive.mild.has(word)) { rejected.offensive += 1; return false; }
      if (isPluralOfAKnownWord(word, stemLookup)) { rejected.plural += 1; return false; }
      if (isInflectionOfAKnownWord(word, stemLookup)) { rejected.inflection += 1; return false; }
      if (hasUnfairShape(word)) { rejected.shape += 1; return false; }
      return true;
    });

    return {
      length,
      words,
      answerFlags,
      answerCount: answerFlags.filter(Boolean).length,
    };
  });

  // -- Structural invariants ------------------------------------------------
  for (const result of results) {
    const joined = result.words.join('');
    if (joined.length !== result.words.length * result.length) {
      throw new Error(`Length-${result.length} string is not a multiple of ${result.length}`);
    }
    for (let i = 1; i < result.words.length; i += 1) {
      if (byAsciiAscending(result.words[i - 1]!, result.words[i]!) >= 0) {
        throw new Error(`Length-${result.length} list is not strictly ascending at index ${i}`);
      }
    }
    if (result.answerFlags.length !== result.words.length) {
      throw new Error(`Length-${result.length} bitmask does not match word count`);
    }
    if (result.answerCount === 0) {
      throw new Error(`Length-${result.length} answer pool is empty -- refusing to build.`);
    }
  }

  // -- Emit -----------------------------------------------------------------
  const generatedOn = new Date().toISOString().slice(0, 10);
  const enableDigest = createHash('sha256').update(enableRaw).digest('hex').slice(0, 16);
  const gameDigest = createHash('sha256').update(gameListRaw).digest('hex').slice(0, 16);
  const sixDigest = createHash('sha256').update(sixOf12Raw).digest('hex').slice(0, 16);

  const blocks = results
    .map((result) => {
      const joined = result.words.join('');
      return [
        `  ${result.length}: {`,
        `    length: ${result.length},`,
        `    count: ${result.words.length},`,
        `    answerCount: ${result.answerCount},`,
        `    words:`,
        `      '${joined}',`,
        `    answerMask:`,
        `      '${encodeBitmask(result.answerFlags)}',`,
        `  },`,
      ].join('\n');
    })
    .join('\n');

  const module = `/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 *
 * Regenerate with:
 *   npm run build:word-puzzle-words --workspace @vitto/core
 * (a manual script; it needs network access and must never run in CI)
 *
 * Generated: ${generatedOn}
 *
 * SOURCES AND LICENCES
 *
 *   Guess-validity lexicon -- ENABLE (enable1.txt), compiled by Alan Beale
 *   and M. Cooper. Public domain.
 *   Source digest (sha256, truncated): ${enableDigest}
 *
 *   Answer-pool commonality signal -- 12dicts version 6.0.2, files
 *   International/3of6game.txt and American/6of12.txt, compiled by Alan Beale
 *   (https://wordlist.aspell.net/12dicts/). Released to the public domain.
 *   The 12dicts ReadMe requests acknowledgment of use:
 *
 *       "The 12dicts lists were compiled by Alan Beale. I explicitly release
 *        them to the public domain, but request acknowledgment of their use."
 *
 *   ACKNOWLEDGED, with thanks to Alan Beale.
 *   The AGID-dependent 12dicts files (2of12inf and the 2+2+3 lists), which
 *   the same ReadMe excludes from that public-domain release, are NOT used.
 *   Source digests (sha256, truncated):
 *     3of6game.txt ${gameDigest}
 *     6of12.txt    ${sixDigest}
 *
 *   Offensive-term filtering -- "List of Dirty, Naughty, Obscene and Otherwise
 *   Bad Words" by Shutterstock, Inc., licensed CC-BY-4.0
 *   (https://creativecommons.org/licenses/by/4.0/), applied at build time in
 *   modified (re-tiered and supplemented) form. The list itself, with its
 *   attribution, is retained at src/data/offensiveWords.fixture.txt.
 *
 * ENCODING
 *
 *   Each entry holds every word of one length concatenated with NO delimiter.
 *   Words are fixed-width, so word i is words.slice(i * length, (i + 1) * length)
 *   and the list is ASCII-ascending -- giving O(log n) validity lookup by
 *   binary search with zero startup parse cost.
 *
 *   \`answerMask\` is base64, one bit per word, most-significant-bit first:
 *   word i is answer-eligible when bit i is set. Keeping eligibility as a mask
 *   over the validity list rather than a second array is also deliberate
 *   obfuscation -- there is no separate answer list in the repo to grep.
 *
 * NOT DERIVED FROM any published puzzle's authored answer sequence.
 */

export const WORD_PUZZLE_WORD_LENGTHS = [${WORD_LENGTHS.join(', ')}] as const;

export type WordPuzzleWordLength = (typeof WORD_PUZZLE_WORD_LENGTHS)[number];

export interface WordPuzzleLengthData {
  /** Number of letters in every word of this entry. */
  readonly length: WordPuzzleWordLength;
  /** Total number of valid guesses of this length. */
  readonly count: number;
  /** How many of those are answer-eligible (the number of set bits in answerMask). */
  readonly answerCount: number;
  /** Every valid guess of this length, concatenated, fixed-width, ASCII-ascending. */
  readonly words: string;
  /** Base64 bitmask over \`words\`, MSB-first, marking answer-eligible entries. */
  readonly answerMask: string;
}

export const WORD_PUZZLE_WORDS: Readonly<Record<WordPuzzleWordLength, WordPuzzleLengthData>> = {
${blocks}
};
`;

  writeFileSync(OUTPUT_PATH, module, 'utf8');

  // -- Report ---------------------------------------------------------------
  const bytes = Buffer.byteLength(module, 'utf8');
  console.log('\nAnswer-pool rejections:');
  console.log(`  not in commonality tier : ${rejected.notCommon}`);
  console.log(`  plural of a known word  : ${rejected.plural}`);
  console.log(`  -ed/-ing inflection     : ${rejected.inflection}`);
  console.log(`  unfair letter shape     : ${rejected.shape}`);
  console.log(`  mild offensive term     : ${rejected.offensive}`);
  console.log('\nPools:');
  for (const result of results) {
    console.log(
      `  ${result.length}-letter: ${String(result.words.length).padStart(6)} valid, ` +
        `${String(result.answerCount).padStart(5)} answer-eligible`,
    );
  }
  console.log(
    `\nWrote ${OUTPUT_PATH}\n  ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`,
  );
  console.log(
    '\nREMINDER: the answer pool still requires a human review pass before launch.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
