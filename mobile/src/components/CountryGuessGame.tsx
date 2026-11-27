import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  COUNTRIES,
  type CompassDirection,
  COUNTRY_GUESS_CONTINENT_HINT_AT,
  COUNTRY_GUESS_FLAG_HINT_AT,
  COUNTRY_GUESS_MAX_GUESSES,
  COUNTRY_GUESS_ROUNDS,
  type Country,
  type CountryGuessFeedback,
  type CountryGuessRoundOutcome,
  type CountryGuessSession,
  DIRECTION_ARROWS,
  findCountry,
  flagEmoji,
  formatDistance,
  generateCountryGuessSession,
  judgeCountryGuess,
  searchCountries,
  toCountryGuessMetadata,
} from '@vitto/core';
import { colors, fonts, layout, text, themedStyles } from '../theme';
import { PrimaryButton, TextButton } from './ui';
import { getLocale, t, tRich } from '../i18n';

interface Props {
  onFinish: (metadata: BrainTrainingMetadata, summary: string[]) => void;
  onCancel: () => void;
  /** Injected in tests so the answers are known. */
  session?: CountryGuessSession;
}

/** Which way to look, spoken: one whole phrase per direction, since "NE" alone is English. */
const LOOK_LABEL: Record<CompassDirection, string> = {
  N: t('Look N'),
  NE: t('Look NE'),
  E: t('Look E'),
  SE: t('Look SE'),
  S: t('Look S'),
  SW: t('Look SW'),
  W: t('Look W'),
  NW: t('Look NW'),
};

/**
 * `findCountry` and `searchCountries` match a country's English names. In
 * another language the player types the name as it is shown, so the translated
 * name is matched too, folded the way those are: case, accents and punctuation
 * ignored. Letters of any script are kept (the English fold keeps only a-z).
 */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!-\/:-@\[-`{-~\u00a1-\u00bf\u2010-\u2027\u3000-\u303f\uff00-\uff0f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const shownName = (country: Country): string => fold(t(country.name));

/** The country a typed entry names, in the app's language or in English. */
const findTypedCountry = (entry: string): Country | null => {
  if (getLocale() === 'en') return findCountry(entry);
  const wanted = fold(entry);
  if (!wanted) return null;
  return COUNTRIES.find((country) => shownName(country) === wanted) ?? findCountry(entry);
};

/** Suggestions for a partly typed name: matches on the shown name first, then the English ones. */
const suggestCountries = (entry: string, limit = 6): Country[] => {
  const english = searchCountries(entry, limit);
  if (getLocale() === 'en') return english;
  const wanted = fold(entry);
  if (!wanted) return english;
  const starts: Country[] = [];
  const contains: Country[] = [];
  for (const country of COUNTRIES) {
    const name = shownName(country);
    if (name.startsWith(wanted)) starts.push(country);
    else if (name.includes(wanted)) contains.push(country);
  }
  const listed = new Set([...starts, ...contains].map((country) => country.code));
  return [...starts, ...contains, ...english.filter((country) => !listed.has(country.code))].slice(0, limit);
};

/**
 * Three mystery countries, six guesses each. Every miss says how far off it was
 * and which way to look; the continent appears after two misses and the flag
 * after four, so a stuck player is nudged rather than stranded.
 */
export function CountryGuessGame({ onFinish, onCancel, session: given }: Props) {
  const [session] = useState<CountryGuessSession>(() => given ?? generateCountryGuessSession());
  const [round, setRound] = useState(0);
  const [guesses, setGuesses] = useState<CountryGuessFeedback[]>([]);
  const [entry, setEntry] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<CountryGuessRoundOutcome[]>([]);
  const startedAt = useRef(Date.now());

  const target = session.targets[round]!;
  const solved = guesses.some((guess) => guess.correct);
  const misses = guesses.filter((guess) => !guess.correct).length;
  const over = solved || guesses.length >= COUNTRY_GUESS_MAX_GUESSES;
  const showContinent = misses >= COUNTRY_GUESS_CONTINENT_HINT_AT;
  const showFlag = misses >= COUNTRY_GUESS_FLAG_HINT_AT;
  const lastRound = round === COUNTRY_GUESS_ROUNDS - 1;

  const suggestions = useMemo(() => {
    if (over) return [];
    const guessed = new Set(guesses.map((guess) => guess.country.code));
    return suggestCountries(entry).filter((country) => !guessed.has(country.code));
  }, [entry, guesses, over]);

  const guess = (country: Country) => {
    if (over) return;
    if (guesses.some((previous) => previous.country.code === country.code)) {
      setNotice(t('You already tried {country}', { country: t(country.name) }));
      return;
    }
    setNotice(null);
    setEntry('');
    setGuesses((current) => [...current, judgeCountryGuess(country, target)]);
  };

  const submitTyped = () => {
    const country = findTypedCountry(entry) ?? suggestions[0] ?? null;
    if (!country) {
      setNotice(entry.trim() ? t('No country by that name here') : null);
      return;
    }
    guess(country);
  };

  const roundOutcome = (): CountryGuessRoundOutcome => ({
    code: target.code,
    solved,
    guessesUsed: guesses.length,
  });

  const nextRound = () => {
    setOutcomes((current) => [...current, roundOutcome()]);
    setGuesses([]);
    setEntry('');
    setNotice(null);
    setRound((current) => current + 1);
  };

  const finish = () => {
    const all = [...outcomes, roundOutcome()];
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const summary = all.map((outcome, index) => {
      const country = session.targets[index]!;
      const shown = { flag: flagEmoji(country.code), country: t(country.name), capital: t(country.capital) };
      return outcome.solved
        ? t('{flag} {country} ({capital}) · solved in {guesses}', { ...shown, guesses: outcome.guessesUsed })
        : t('{flag} {country} ({capital}) · not found', shown);
    });
    onFinish(toCountryGuessMetadata(all, durationSeconds), summary);
  };

  return (
    <>
      <View style={styles.scoreboard}>
        <Text style={styles.scoreItem}>
          {tRich('Country {round}/{total}', { round: <Text style={styles.scoreValue}>{round + 1}</Text> }, { total: COUNTRY_GUESS_ROUNDS })}
        </Text>
        <Text style={styles.scoreItem}>
          {tRich('{guesses} guesses left', { guesses: <Text style={styles.scoreValue}>{Math.max(0, COUNTRY_GUESS_MAX_GUESSES - guesses.length)}</Text> })}
        </Text>
        <Text style={styles.scoreItem}>
          {tRich('{count} solved', { count: <Text style={styles.scoreValue}>{outcomes.filter((outcome) => outcome.solved).length + (solved ? 1 : 0)}</Text> })}
        </Text>
      </View>

      <View style={[styles.mystery, solved && styles.mysterySolved, over && !solved && styles.mysteryLost]}>
        <Text style={styles.mysteryFlag}>{over || showFlag ? flagEmoji(target.code) : '?'}</Text>
        <Text style={styles.mysteryTitle}>
          {over ? t(target.name) : t('Mystery country')}
        </Text>
        <Text style={styles.mysteryHint}>
          {over
            ? t('Capital: {capital} · {continent}', { capital: t(target.capital), continent: t(target.continent) })
            : showContinent
              ? t('Somewhere in {continent}', { continent: t(target.continent) })
              : t('Each guess tells you how far away it was, and which way to look.')}
        </Text>
      </View>

      {guesses.length ? (
        <View style={styles.guesses}>
          {guesses.map((feedback, index) => (
            <View key={feedback.country.code} style={[styles.guessRow, feedback.correct && styles.guessRowRight]}>
              <Text style={styles.guessIndex} numberOfLines={1}>{index + 1}</Text>
              <Text style={styles.guessFlag}>{flagEmoji(feedback.country.code)}</Text>
              <Text style={styles.guessName} numberOfLines={1}>
                {t(feedback.country.name)}
              </Text>
              {feedback.correct ? (
                <Text style={styles.guessRight} numberOfLines={1}>{t('Correct!')}</Text>
              ) : (
                <>
                  <Text style={styles.guessDistance} numberOfLines={1}>{formatDistance(feedback.distanceKm)}</Text>
                  <Text style={styles.guessArrow} accessibilityLabel={LOOK_LABEL[feedback.direction]}>
                    {DIRECTION_ARROWS[feedback.direction]}
                  </Text>
                  <Text style={styles.guessProximity} numberOfLines={1}>{feedback.proximity}%</Text>
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {!over ? (
        <View style={styles.entryBox}>
          <TextInput
            style={[layout.input, styles.input]}
            value={entry}
            onChangeText={(value) => {
              setEntry(value);
              setNotice(null);
            }}
            onSubmitEditing={submitTyped}
            placeholder={t('Type a country')}
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="go"
            accessibilityLabel={t('Country guess')}
          />
          {suggestions.length ? (
            <View style={styles.suggestions}>
              {suggestions.map((country) => (
                <Pressable
                  key={country.code}
                  accessibilityRole="button"
                  accessibilityLabel={t('Guess {country}', { country: t(country.name) })}
                  onPress={() => guess(country)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                >
                  <Text style={styles.suggestionFlag}>{flagEmoji(country.code)}</Text>
                  <Text style={styles.suggestionName}>{t(country.name)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.notice}>{notice ?? ' '}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {over ? (
          <PrimaryButton label={lastRound ? t('See my score') : t('Next country')} onPress={lastRound ? finish : nextRound} />
        ) : (
          <PrimaryButton label={t('Guess')} disabled={!entry.trim()} onPress={submitTyped} />
        )}
        <TextButton label={t('Cancel')} onPress={onCancel} />
      </View>
    </>
  );
}

const styles = themedStyles(() => ({
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  scoreItem: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  scoreValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  mystery: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.3)',
    backgroundColor: colors.sageSoft,
    marginBottom: 14,
  },
  mysterySolved: { borderColor: colors.mintDeep, backgroundColor: colors.mint },
  mysteryLost: { borderColor: colors.coral, backgroundColor: colors.coralWash },
  mysteryFlag: { fontFamily: fonts.ui, fontSize: 55, lineHeight: 65 },
  mysteryTitle: { fontFamily: fonts.ui, fontSize: 28, color: colors.ink, marginTop: 6, textAlign: 'center' },
  mysteryHint: { ...text.body, fontSize: 17, color: colors.muted, marginTop: 6, textAlign: 'center' },
  guesses: { gap: 6, marginBottom: 14 },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  guessRowRight: { borderColor: colors.mintDeep, backgroundColor: colors.mint },
  guessIndex: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, width: 12, flexShrink: 0 },
  guessFlag: { fontFamily: fonts.ui, fontSize: 20, flexShrink: 0 },
  guessName: { fontFamily: fonts.ui, flex: 1, minWidth: 0, fontSize: 15, fontWeight: '500', color: colors.ink },
  guessDistance: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSoft, flexShrink: 0 },
  guessArrow: { fontFamily: fonts.ui, fontSize: 20, color: colors.coralDeep, width: 22, textAlign: 'center', flexShrink: 0 },
  guessProximity: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, width: 36, textAlign: 'right', flexShrink: 0 },
  guessRight: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.mintDeep, flexShrink: 0 },
  entryBox: { marginBottom: 4 },
  input: { fontFamily: fonts.ui, fontSize: 17 },
  suggestions: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  suggestionPressed: { backgroundColor: colors.cardSoft },
  suggestionFlag: { fontFamily: fonts.ui, fontSize: 20 },
  // Shrinks beside the flag, so a long name ("Bosnia and Herzegovina") wraps rather than overflowing the row.
  suggestionName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink, flexShrink: 1, minWidth: 0 },
  notice: { fontFamily: fonts.ui, fontSize: 12, color: colors.danger, marginTop: 6, minHeight: 16 },
  actions: { marginTop: 20, gap: 16 },
}));
