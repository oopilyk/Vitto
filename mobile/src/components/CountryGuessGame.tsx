import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type BrainTrainingMetadata,
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
import { colors, fonts, layout, text } from '../theme';
import { PrimaryButton, TextButton } from './ui';

interface Props {
  onFinish: (metadata: BrainTrainingMetadata, summary: string[]) => void;
  onCancel: () => void;
  /** Injected in tests so the answers are known. */
  session?: CountryGuessSession;
}

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
    return searchCountries(entry).filter((country) => !guessed.has(country.code));
  }, [entry, guesses, over]);

  const guess = (country: Country) => {
    if (over) return;
    if (guesses.some((previous) => previous.country.code === country.code)) {
      setNotice(`You already tried ${country.name}`);
      return;
    }
    setNotice(null);
    setEntry('');
    setGuesses((current) => [...current, judgeCountryGuess(country, target)]);
  };

  const submitTyped = () => {
    const country = findCountry(entry) ?? suggestions[0] ?? null;
    if (!country) {
      setNotice(entry.trim() ? 'No country by that name here' : null);
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
      return `${flagEmoji(country.code)} ${country.name} (${country.capital}) · ${
        outcome.solved ? `solved in ${outcome.guessesUsed}` : 'not found'
      }`;
    });
    onFinish(toCountryGuessMetadata(all, durationSeconds), summary);
  };

  return (
    <>
      <View style={styles.scoreboard}>
        <Text style={styles.scoreItem}>
          Country <Text style={styles.scoreValue}>{round + 1}</Text>/{COUNTRY_GUESS_ROUNDS}
        </Text>
        <Text style={styles.scoreItem}>
          <Text style={styles.scoreValue}>{Math.max(0, COUNTRY_GUESS_MAX_GUESSES - guesses.length)}</Text> guesses left
        </Text>
        <Text style={styles.scoreItem}>
          <Text style={styles.scoreValue}>{outcomes.filter((outcome) => outcome.solved).length + (solved ? 1 : 0)}</Text> solved
        </Text>
      </View>

      <View style={[styles.mystery, solved && styles.mysterySolved, over && !solved && styles.mysteryLost]}>
        <Text style={styles.mysteryFlag}>{over || showFlag ? flagEmoji(target.code) : '🌍'}</Text>
        <Text style={styles.mysteryTitle}>
          {over ? `${target.name}` : 'Mystery country'}
        </Text>
        <Text style={styles.mysteryHint}>
          {over
            ? `Capital: ${target.capital} · ${target.continent}`
            : showContinent
              ? `Somewhere in ${target.continent}`
              : 'Each guess tells you how far away it was, and which way to look.'}
        </Text>
      </View>

      {guesses.length ? (
        <View style={styles.guesses}>
          {guesses.map((feedback, index) => (
            <View key={feedback.country.code} style={[styles.guessRow, feedback.correct && styles.guessRowRight]}>
              <Text style={styles.guessIndex}>{index + 1}</Text>
              <Text style={styles.guessFlag}>{flagEmoji(feedback.country.code)}</Text>
              <Text style={styles.guessName} numberOfLines={1}>
                {feedback.country.name}
              </Text>
              {feedback.correct ? (
                <Text style={styles.guessRight}>Correct!</Text>
              ) : (
                <>
                  <Text style={styles.guessDistance}>{formatDistance(feedback.distanceKm)}</Text>
                  <Text style={styles.guessArrow} accessibilityLabel={`Look ${feedback.direction}`}>
                    {DIRECTION_ARROWS[feedback.direction]}
                  </Text>
                  <Text style={styles.guessProximity}>{feedback.proximity}%</Text>
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
            placeholder="Type a country"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="go"
            accessibilityLabel="Country guess"
          />
          {suggestions.length ? (
            <View style={styles.suggestions}>
              {suggestions.map((country) => (
                <Pressable
                  key={country.code}
                  accessibilityRole="button"
                  accessibilityLabel={`Guess ${country.name}`}
                  onPress={() => guess(country)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                >
                  <Text style={styles.suggestionFlag}>{flagEmoji(country.code)}</Text>
                  <Text style={styles.suggestionName}>{country.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.notice}>{notice ?? ' '}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {over ? (
          <PrimaryButton label={lastRound ? 'See my score' : 'Next country'} onPress={lastRound ? finish : nextRound} />
        ) : (
          <PrimaryButton label="Guess" disabled={!entry.trim()} onPress={submitTyped} />
        )}
        <TextButton label="Cancel" onPress={onCancel} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scoreboard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  scoreItem: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  scoreValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  mystery: {
    alignItems: 'center',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.3)',
    backgroundColor: colors.sageSoft,
    marginBottom: 14,
  },
  mysterySolved: { borderColor: '#8fae91', backgroundColor: '#dcecdb' },
  mysteryLost: { borderColor: '#d8a396', backgroundColor: '#f5e3de' },
  mysteryFlag: { fontSize: 54, lineHeight: 64 },
  mysteryTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginTop: 6, textAlign: 'center' },
  mysteryHint: { ...text.body, fontSize: 13, color: colors.muted, marginTop: 6, textAlign: 'center' },
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
  guessRowRight: { borderColor: '#8fae91', backgroundColor: '#dcecdb' },
  guessIndex: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, width: 12 },
  guessFlag: { fontSize: 18 },
  guessName: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
  guessDistance: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
  guessArrow: { fontSize: 18, color: colors.coralDeep, width: 22, textAlign: 'center' },
  guessProximity: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, width: 36, textAlign: 'right' },
  guessRight: { fontSize: 13, fontWeight: '600', color: colors.mintDeep },
  entryBox: { marginBottom: 4 },
  input: { fontSize: 17 },
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
  suggestionFlag: { fontSize: 18 },
  suggestionName: { fontSize: 14, color: colors.ink },
  notice: { fontFamily: fonts.mono, fontSize: 11, color: colors.danger, marginTop: 6, minHeight: 16 },
  actions: { marginTop: 20, gap: 16 },
});
