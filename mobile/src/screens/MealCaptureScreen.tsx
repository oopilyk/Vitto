import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View, Alert, Keyboard, Linking, Platform } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {  detectFoodEffects,type FoodSearchResult, type MealAnalysis, type MealMetadata, type MealPetContext, type RepeatableMeal, forSlot, calorieEstimate, foodSuggestions, quickAddAnalysis, servingGrams, servingsFrom, amountIn, type PortionUnit, MEAL_SLOTS, MEAL_SLOT_LABEL, slotForTime, type MealSlot, type HealthEvent, portionAmount, repeatMeal, describeSubMacros, errorMessage, lookupBarcode, searchFoodsByName, toMealAnalysis, toPlateAnalysis } from '@vitto/core';
import { analyzeMealImage, correctMealAnalysis, shrinkForUpload, type PickedImage } from '../services/mealAnalysis';
import { CloseButton, ErrorText, Kicker, NumberInput, PressableScale, PrimaryButton, SheetKeyboardAvoidingView, TextButton, DoneTextInput, Mark } from '../components/ui';
import { FatSecretCredit } from '../components/FatSecretCredit';
import { colors, fonts, layout, text, themedStyles } from '../theme';

interface Props {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (analyzing: boolean) => void;
  onClose: () => void;
  /** Who is about to eat this, so the photo analysis can come back with their reaction. */
  petContext?: MealPetContext;
  /**
   * Photo macro tracking is Plus. False shows the Photo tab as a locked Plus
   * feature and opens on Search instead. Defaults to true.
   */
  canScanPhotos?: boolean;
  /** Opens the Plus paywall from the locked Photo tab. */
  onOpenPlus?: () => void;
  /** Meals to log again in one tap (repeatableMeals), newest first. */
  repeatable?: readonly RepeatableMeal[];
  /** Foods this person has logged, newest first, suggested first as a search is typed. */
  knownFoods?: readonly string[];
  /** Yesterday's meals in a slot, for "Copy yesterday's breakfast" (copyableSlot); empty hides it. */
  copyableFor?: (slot: MealSlot) => readonly HealthEvent<MealMetadata>[];
  /** Logs those meals again, now, in the slot. */
  onCopy?: (meals: readonly HealthEvent<MealMetadata>[], slot: MealSlot) => Promise<void>;
}

type Mode = 'photo' | 'search' | 'scan';

/**
 * The camera to scan with, from the phone's own list (iOS names them in
 * English, e.g. "Back Triple Camera"). Pro iPhones' main camera cannot focus
 * nearer than about 20 cm, so a barcode held where it is natural to hold one
 * stays blurred. The combined cameras switch to the ultra-wide lens up close,
 * which focuses at a few centimetres. A phone without one keeps the default.
 */
export const closeUpLens = (lenses: readonly string[]): string | undefined =>
  lenses.find((name) => /triple/i.test(name)) ?? lenses.find((name) => /dual wide/i.test(name));

export function MealCaptureScreen({ onComplete, onFeedStart, onAnalyzingChange, onClose, petContext, canScanPhotos = true, onOpenPlus, repeatable = [], knownFoods = [], copyableFor, onCopy }: Props) {
  // Which meal of the day this is: read off the clock, changed with a tap.
  const [slot, setSlot] = useState<MealSlot>(() => slotForTime(new Date()));
  const [mode, setMode] = useState<Mode>(canScanPhotos ? 'photo' : 'search');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [busy, setBusy] = useState<'analyzing' | 'fixing' | 'saving' | 'searching' | null>(null);
  /** What the person says the plate really was, while they correct the AI; null when not correcting. */
  const [fixText, setFixText] = useState<string | null>(null);
  // The fix box is the last thing on the photo page, so it opened straight
  // under the keyboard: once the sheet has shrunk above the keyboard, the
  // page is scrolled down to it.
  const scroll = useRef<ScrollView>(null);
  const fixing = fixText !== null;
  useEffect(() => {
    if (!fixing) return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => shown.remove();
  }, [fixing]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  /**
   * The foods ticked in search, with how many servings of each, logged
   * together as one meal. Kept across searches, so "chicken", then "rice",
   * builds one plate.
   */
  const [plate, setPlate] = useState<{ food: FoodSearchResult; servings: number }[]>([]);
  /** The scanned food. */
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [servings, setServings] = useState('1');
  /** A recent meal picked to log again, and how much of it this time. */
  const [again, setAgain] = useState<{ meal: RepeatableMeal; servings: number } | null>(null);
  const againAnalysis = again ? repeatMeal(again.meal.analysis, again.servings) : null;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  /** The close-focus camera for barcodes, once the phone has said which it has. */
  const [scanLens, setScanLens] = useState<string | undefined>(undefined);

  const reset = () => {
    setAnalysis(null);
    setFixText(null);
    setSelected(null);
    setAgain(null);
    setError(null);
  };

  const pick = async (from: 'camera' | 'library') => {
    reset();
    const permissionResult =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setError(
        from === 'camera'
          ? 'Camera access is off. Enable it in Settings to photograph a meal.'
          : 'Photo access is off. Enable it in Settings to choose a meal photo.',
      );
      return;
    }
    // base64 keeps the bytes in hand, so nothing has to read the file back later.
    const options: ImagePicker.ImagePickerOptions = {
      quality: 0.6,
      mediaTypes: ['images'],
      base64: true,
    };
    const picked =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets?.length) return;

    const asset = picked.assets[0];
    if (!asset.base64) {
      setError('That photo could not be read. Try another one.');
      return;
    }
    const shrunk = await shrinkForUpload({ ...asset, base64: asset.base64, mimeType: asset.mimeType ?? undefined });
    setImage(shrunk);
    // Straight to reading it: choosing the photo is the decision to log it.
    await analyze(shrunk);
  };

  const analyze = async (photo: PickedImage | null = image) => {
    if (!photo) return;
    setBusy('analyzing');
    onAnalyzingChange(true);
    setError(null);
    try {
      setAnalysis(await analyzeMealImage(photo, petContext));
    } catch (cause) {
      setError(errorMessage(cause, 'Meal analysis failed.'));
    } finally {
      setBusy(null);
      onAnalyzingChange(false);
    }
  };

  /** Re-reads the plate from their correction, without sending the photo again. */
  const fix = async () => {
    if (!analysis || !fixText?.trim() || busy) return;
    setBusy('fixing');
    setError(null);
    try {
      setAnalysis(await correctMealAnalysis(analysis, fixText, petContext));
      setFixText(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not re-analyze that.'));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Searches `term` (what is typed, by default). `live` is the search made on
   * a pause in typing: it leaves the keyboard up and keeps quiet when nothing
   * matches yet, since the word is likely not finished.
   */
  const runSearch = async (term: string = query, live = false) => {
    // Searching is done typing: the results go where the keyboard was.
    if (!live) Keyboard.dismiss();
    const trimmed = term.trim();
    // A search already in flight is not re-fired: the food APIs are rate limited
    // per IP, so an impatient second tap spends quota that the first request is
    // already waiting on.
    if (!trimmed || busy) return;
    searched.current = trimmed.toLowerCase();
    setAgain(null);
    setError(null);
    // Each term goes to the server once a visit (60 searches an hour per account).
    const cached = searchCache.current.get(trimmed.toLowerCase());
    if (cached) {
      setResults(cached);
      if (cached.length === 0 && !live) setError('No foods matched that search.');
      return;
    }
    setBusy('searching');
    try {
      const found = await searchFoodsByName(trimmed);
      const list = Array.isArray(found) ? found : [];
      searchCache.current.set(trimmed.toLowerCase(), list);
      setResults(list);
      if (list.length === 0 && !live) setError('No foods matched that search.');
    } catch (cause) {
      if (!live) setError(errorMessage(cause, 'Food search failed.'));
    } finally {
      setBusy(null);
    }
  };

  // Autocomplete: names to finish the word at once (theirs, then common foods),
  // and a real search when typing pauses, so Find is rarely needed.
  const searched = useRef('');
  const searchCache = useRef(new Map<string, FoodSearchResult[]>());
  const suggestions = useMemo(
    () => (mode === 'search' && query.trim().toLowerCase() !== searched.current ? foodSuggestions(query, knownFoods) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, query, knownFoods, results],
  );
  useEffect(() => {
    const trimmed = query.trim();
    if (mode !== 'search' || trimmed.length < LIVE_SEARCH_MIN || busy || trimmed.toLowerCase() === searched.current) return undefined;
    const timer = setTimeout(() => void runSearch(trimmed, true), LIVE_SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, busy]);
  const pickSuggestion = (name: string) => {
    setQuery(name);
    void runSearch(name);
  };

  const onBarcode = async ({ data }: { data: string }) => {
    if (scanned || busy) return;
    setScanned(true);
    setBusy('searching');
    setError(null);
    try {
      const found = await lookupBarcode(data);
      if (!found) {
        setError(`No food found for barcode ${data}.`);
        setScanned(false);
      } else {
        setSelected(found);
        setServings('1');
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Barcode lookup failed.'));
      setScanned(false);
    } finally {
      setBusy(null);
    }
  };

  const saveAnalysis = async (next: MealAnalysis, loggedVia: MealMetadata['loggedVia']) => {
    setBusy('saving');
    setError(null);
    try {
      await onComplete({ ...next.nutrients, analysis: next, loggedVia, slot });
      onFeedStart(loggedVia === 'ai' ? (image?.uri ?? null) : null, next.grade);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this meal.'));
    } finally {
      setBusy(null);
    }
  };

  /** Quick add: a meal as numbers alone, for food no database has. Null while closed. */
  const [quick, setQuick] = useState<{ name: string; calories?: number; proteinGrams?: number; carbsGrams?: number; fatGrams?: number } | null>(null);

  /** The plate food whose amount field is open. */
  const [amountFor, setAmountFor] = useState<string | null>(null);

  // "Copy yesterday's breakfast": the whole slot again in one tap, while today's
  // is still empty (copyableSlot).
  const toCopy = copyableFor?.(slot) ?? [];
  const copy = async () => {
    if (!onCopy || toCopy.length === 0) return;
    setBusy('saving');
    setError(null);
    try {
      await onCopy(toCopy, slot);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not copy that meal.'));
    } finally {
      setBusy(null);
    }
  };
  const copyRow =
    onCopy && toCopy.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy yesterday's ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}
        disabled={busy !== null}
        onPress={() => void copy()}
        style={({ pressed }) => [styles.copy, pressed && styles.copyPressed]}
        testID="copy-slot"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.copyTitle}>{`Copy yesterday's ${MEAL_SLOT_LABEL[slot].toLowerCase()}`}</Text>
          <Text style={styles.copyMeta} numberOfLines={1}>
            {`${toCopy.map((meal) => meal.metadata.analysis?.foodDescription || meal.metadata.analysis?.detectedFoods.join(', ') || 'Meal').join(' · ')} · ${toCopy
              .reduce((sum, meal) => sum + calorieEstimate(meal.metadata.analysis?.macros), 0)
              .toLocaleString()} kcal`}
          </Text>
        </View>
        <Mark kind="plus" size={12} color={colors.coral} />
      </Pressable>
    ) : null;

  const onPlate = (food: FoodSearchResult) => plate.some((item) => item.food.id === food.id);
  const togglePlate = (food: FoodSearchResult) => {
    setAgain(null);
    setPlate((current) =>
      current.some((item) => item.food.id === food.id)
        ? current.filter((item) => item.food.id !== food.id)
        : [...current, { food, servings: 1 }],
    );
  };
  const setPlateServings = (id: string, next: number) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, servings: next } : item)));
  const plateAnalysis = plate.length > 0 ? toPlateAnalysis(plate) : null;

  const selectedAnalysis = selected
    ? toMealAnalysis(selected, Math.max(0.1, Number(servings) || 1))
    : null;

  // The one thing to do next, pinned under the page so it is never a scroll
  // away: log the meal, or (photo) say it is being read or offer a retry.
  const quickAnalysis =
    quick && quick.calories !== undefined && quick.calories > 0 && quick.calories <= 10000
      ? quickAddAnalysis({ ...quick, calories: quick.calories })
      : null;
  const footer: { label: string; summary?: string; busy?: boolean; disabled?: boolean; onPress: () => void } | null =
    mode === 'search' && quickAnalysis
      ? {
          label: busy === 'saving' ? 'Saving...' : 'Add to care log',
          summary: summaryOf(quickAnalysis),
          busy: busy === 'saving',
          onPress: () => void saveAnalysis(quickAnalysis, 'manual'),
        }
      : againAnalysis
      ? {
          label: busy === 'saving' ? 'Saving...' : 'Add to care log',
          summary: summaryOf(againAnalysis),
          busy: busy === 'saving',
          // A repeat is typed in, not read from a photo or a barcode.
          onPress: () => void saveAnalysis(againAnalysis, 'manual'),
        }
      : mode === 'photo' && canScanPhotos
      ? busy === 'analyzing'
        ? { label: 'Reading your plate...', busy: true, disabled: true, onPress: () => {} }
        : analysis && fixText === null
          ? { label: busy === 'saving' ? 'Saving...' : 'Add to care log', summary: summaryOf(analysis), busy: busy === 'saving', onPress: () => void saveAnalysis(analysis, 'ai') }
          : image && !analysis
            ? { label: 'Try again', onPress: () => void analyze() }
            : null
      : mode === 'search' && plateAnalysis
        ? {
            label: busy === 'saving' ? 'Saving...' : plate.length === 1 ? 'Add to care log' : `Add ${plate.length} foods`,
            summary: summaryOf(plateAnalysis),
            busy: busy === 'saving',
            onPress: () => void saveAnalysis(plateAnalysis, 'manual'),
          }
        : mode === 'scan' && selectedAnalysis
          ? { label: busy === 'saving' ? 'Saving...' : 'Add to care log', summary: summaryOf(selectedAnalysis), busy: busy === 'saving', onPress: () => void saveAnalysis(selectedAnalysis, 'barcode') }
          : null;

  /**
   * The × with a meal ready to log asks before throwing it away: foods on the
   * plate, a read photo, a scanned product or a picked recent meal. An empty
   * sheet just closes. (react-native-web's Alert has no buttons: it closes.)
   */
  const unsaved = plate.length > 0 || again !== null || analysis !== null || selected !== null || quickAnalysis !== null;
  const requestClose = () => {
    if (!unsaved || busy === 'saving' || Platform.OS === 'web') {
      onClose();
      return;
    }
    Alert.alert('Discard this meal?', "It hasn't been added to your log yet.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  return (
    <SheetPage onBackPress={requestClose}>
      <SheetKeyboardAvoidingView style={styles.sheet}>
        <View style={styles.header}>
          {/* Flexed, so a long title at large text wraps instead of pushing × off the sheet. */}
          <View style={{ flex: 1 }}>
            <Kicker>Nourishment check</Kicker>
            <Text style={styles.title}>What's on your plate?</Text>
          </View>
          <CloseButton onPress={requestClose} />
        </View>

        <View style={styles.tabs}>
          {(['photo', 'search', 'scan'] as Mode[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                setMode(option);
                reset();
                setPlate([]);
                setScanned(false);
              }}
              style={[styles.tab, mode === option && styles.tabOn]}
            >
              <Text style={[styles.tabLabel, mode === option && styles.tabLabelOn]}>
                {option === 'photo' ? (canScanPhotos ? 'Photo' : 'Photo · Plus') : option === 'search' ? 'Search' : 'Scan barcode'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.slots} accessibilityRole="radiogroup" accessibilityLabel="Which meal">
          {MEAL_SLOTS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: slot === option }}
              accessibilityLabel={MEAL_SLOT_LABEL[option]}
              hitSlop={{ top: 8, bottom: 8 }}
              onPress={() => setSlot(option)}
              style={[styles.slot, slot === option && styles.slotOn]}
            >
              <Text style={[styles.slotLabel, slot === option && styles.slotLabelOn]}>{MEAL_SLOT_LABEL[option]}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          ref={scroll}
          style={styles.scrollArea}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // As the box grows line by line, or Re-analyze's error appears under it.
          onContentSizeChange={() => {
            if (fixing) scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          {mode === 'photo' && !canScanPhotos ? (
            <View style={styles.locked} testID="photo-locked">
              <Text style={styles.lockedTitle}>Snap your plate. Plus does the macros.</Text>
              <Text style={styles.lockedBody}>
                Photo meal tracking is part of Vitto Plus: take a picture and Vitto reads the plate, estimates the calories and macros, and grades it. Searching foods and scanning barcodes stay free.
              </Text>
              {onOpenPlus ? <PrimaryButton label="See Plus" onPress={onOpenPlus} /> : null}
              <TextButton label="Search foods instead" onPress={() => setMode('search')} />
            </View>
          ) : null}

          {mode === 'photo' && canScanPhotos ? (
            <>
              {/* The big box is the obvious thing to tap, so it opens the camera
                  (testers tapped it again and again before finding the buttons). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={image ? 'Retake the photo' : 'Take a photo of your meal'}
                onPress={() => void pick('camera')}
                disabled={busy !== null}
                style={({ pressed }) => pressed && styles.dropPressed}
                testID="photo-box"
              >
                {image ? (
                  <Image source={{ uri: image.uri }} style={styles.preview} />
                ) : (
                  <View style={styles.dropzone}>
                    <Text style={styles.dropTitle}>Tap to take a photo</Text>
                    <Text style={styles.dropHint}>Vitto reads the plate and grades it</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.pickRow}>
                <PressableScale style={styles.pickButton} onPress={() => pick('camera')}>
                  <Text style={styles.pickLabel}>Take photo</Text>
                </PressableScale>
                <PressableScale style={styles.pickButton} onPress={() => pick('library')}>
                  <Text style={styles.pickLabel}>Choose from library</Text>
                </PressableScale>
              </View>

              {!image && !analysis ? copyRow : null}
              {!image && !analysis ? <RecentMeals meals={forSlot(repeatable, slot)} again={again} onChange={setAgain} /> : null}

              {analysis ? <AnalysisCard analysis={analysis} /> : null}
              {/* The AI can mistake one drink for another; the person knows. */}
              {analysis && fixText === null ? (
                <TextButton
                  label="Not quite right? Fix it"
                  onPress={() => setFixText(analysis.foodDescription ?? analysis.detectedFoods.join(', '))}
                  disabled={busy !== null}
                />
              ) : null}
              {analysis && fixText !== null ? (
                <View style={styles.fixBox} testID="meal-fix">
                  <Text style={styles.fixLabel}>What was it really?</Text>
                  <TextInput
                    style={[layout.input, styles.fixInput]}
                    value={fixText}
                    onChangeText={setFixText}
                    placeholder="e.g. strawberry matcha with almond milk"
                    placeholderTextColor={colors.faint}
                    multiline
                    maxLength={300}
                    autoFocus
                    accessibilityLabel="What the meal really was"
                  />
                  <Text style={styles.fixHint}>One fix a day is free. After that, a fix counts as one of your photos.</Text>
                  <View style={styles.fixActions}>
                    <PrimaryButton
                      label={busy === 'fixing' ? 'Re-analyzing...' : 'Re-analyze'}
                      busy={busy === 'fixing'}
                      disabled={!fixText.trim() || busy !== null}
                      onPress={() => void fix()}
                    />
                    <TextButton label="Never mind" onPress={() => setFixText(null)} disabled={busy !== null} />
                  </View>
                </View>
              ) : null}
              {busy === 'analyzing' ? <Text style={styles.reading}>Reading your plate...</Text> : null}
              <ErrorText>{error}</ErrorText>
            </>
          ) : null}

          {mode === 'search' ? (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={[layout.input, styles.searchInput]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search foods"
                  placeholderTextColor={colors.faint}
                  returnKeyType="search"
                  onSubmitEditing={() => void runSearch()}
                />
                <PressableScale style={styles.searchButton} onPress={() => void runSearch()} accessibilityRole="button" accessibilityLabel="Find">
                  {busy === 'searching' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.searchButtonLabel}>Find</Text>
                  )}
                </PressableScale>
              </View>

              {quick ? (
                <View style={styles.quick} testID="quick-add">
                  <View style={styles.quickHead}>
                    <Text style={styles.quickTitle}>Quick add</Text>
                    <TextButton label="Cancel" onPress={() => setQuick(null)} />
                  </View>
                  <TextInput
                    style={layout.input}
                    value={quick.name}
                    onChangeText={(name) => setQuick({ ...quick, name })}
                    placeholder="What was it? (optional)"
                    placeholderTextColor={colors.faint}
                    maxLength={60}
                    accessibilityLabel="Quick add name"
                  />
                  <View style={styles.quickRow}>
                    {([
                      ['calories', 'kcal'],
                      ['proteinGrams', 'protein g'],
                      ['carbsGrams', 'carbs g'],
                      ['fatGrams', 'fat g'],
                    ] as const).map(([key, label]) => (
                      <View key={key} style={styles.quickField}>
                        <NumberInput
                          decimal={key !== 'calories'}
                          style={[layout.input, styles.quickInput]}
                          value={quick[key]}
                          onValue={(value) => setQuick({ ...quick, [key]: value })}
                          placeholder="0"
                          placeholderTextColor={colors.faint}
                          accessibilityLabel={`Quick add ${label}`}
                        />
                        <Text style={styles.quickLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.quickOpen}>
                  <TextButton label="Quick add calories" onPress={() => setQuick({ name: query.trim() })} />
                </View>
              )}

              {!quick && suggestions.length > 0 ? (
                <View style={styles.suggestions} testID="food-suggestions">
                  {suggestions.map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityLabel={`Search ${name}`}
                      onPress={() => pickSuggestion(name)}
                      style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
                    >
                      <Text style={styles.suggestionLabel} numberOfLines={1}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {plate.length > 0 ? (
                <View style={styles.plate} testID="plate">
                  <Text style={styles.plateTitle}>Your plate</Text>
                  {plate.map(({ food, servings: count }) => (
                    <View key={food.id}>
                      <View style={styles.plateRow}>
                        {/* The amount opens a field for it in grams, ounces or servings. */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${food.name}, ${portionAmount(food, count)}. Change the amount`}
                          onPress={() => setAmountFor(amountFor === food.id ? null : food.id)}
                          style={styles.plateText}
                        >
                          <Text style={styles.plateName} numberOfLines={1}>{food.name}</Text>
                          <Text style={styles.resultMeta} numberOfLines={1}>
                            {Math.round(food.macros.calories * count).toLocaleString()} kcal ·{' '}
                            <Text style={styles.amountLink}>{portionAmount(food, count)}</Text>
                          </Text>
                        </Pressable>
                        <Stepper
                          value={count}
                          label={food.name}
                          onChange={(next) => setPlateServings(food.id, next)}
                          onRemove={() => togglePlate(food)}
                        />
                      </View>
                      {amountFor === food.id ? (
                        <AmountEditor food={food} servings={count} onChange={(next) => setPlateServings(food.id, next)} />
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {results.length === 0 && plate.length === 0 ? (
                <>
                  {copyRow}
                  <RecentMeals meals={forSlot(repeatable, slot)} again={again} onChange={setAgain} />
                </>
              ) : null}

              {/* Tap to put a food on the plate, tap again to take it off; as
                  many as the meal had. */}
              {results.map((food) => {
                const on = onPlate(food);
                return (
                  <Pressable
                    key={food.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={food.name}
                    style={[styles.result, on && styles.resultOn]}
                    onPress={() => togglePlate(food)}
                  >
                    <View style={styles.resultText}>
                      <Text style={styles.resultName}>{food.name}</Text>
                      <Text style={styles.resultMeta}>
                        {food.macros.calories} kcal · {food.servingDescription}
                      </Text>
                    </View>
                    <View style={[styles.tick, on && styles.tickOn]}>
                      {on ? <Mark kind="check" size={12} weight={2.2} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
              {/* FatSecret's terms: its credit wherever its foods are shown. */}
              {results.some((food) => food.source === 'fatsecret') ? <FatSecretCredit /> : null}

              <ErrorText>{error}</ErrorText>
            </>
          ) : null}

          {mode === 'scan' ? (
            <>
              {!permission?.granted ? (
                <View style={[styles.dropzone, styles.permission]} testID="camera-permission">
                  <Text style={styles.dropTitle}>Camera access needed</Text>
                  <Text style={styles.dropHint}>
                    {permission && !permission.canAskAgain
                      ? 'Camera access is off for Vitto. Turn it on in Settings to scan barcodes.'
                      : 'To scan a barcode, allow the camera.'}
                  </Text>
                  {/* Once someone has said no, iOS will not ask again: the only
                      way back is the app's page in Settings. */}
                  <PressableScale
                    accessibilityRole="button"
                    style={styles.permissionButton}
                    onPress={() => void (permission && !permission.canAskAgain ? Linking.openSettings() : requestPermission())}
                  >
                    <Text style={styles.permissionLabel}>
                      {permission && !permission.canAskAgain ? 'Open Settings' : 'Allow camera'}
                    </Text>
                  </PressableScale>
                </View>
              ) : (
                <View style={styles.scanner}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    // A camera that can focus close: see closeUpLens.
                    selectedLens={scanLens}
                    onAvailableLensesChanged={({ lenses }) => setScanLens(closeUpLens(lenses))}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
                    }}
                    onBarcodeScanned={scanned ? undefined : onBarcode}
                  />
                </View>
              )}
              <Text style={styles.scanHint}>
                {scanned ? 'Found it — check the details below.' : 'Point the camera at a product barcode.'}
              </Text>

              {/* How many: a scanned bar is one bar, but two is two. */}
              {selectedAnalysis ? <ServingsRow food={selected} servings={servings} onChange={setServings} /> : null}
              {selectedAnalysis ? <AnalysisCard analysis={selectedAnalysis} /> : null}
              {selected?.source === 'fatsecret' ? <FatSecretCredit /> : null}
              <ErrorText>{error}</ErrorText>

              {scanned ? (
                <View style={styles.actions}>
                  <TextButton
                    label="Scan another"
                    onPress={() => {
                      setScanned(false);
                      setSelected(null);
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
        {footer ? (
          <View style={styles.footer} testID="meal-footer">
            {footer.summary ? <Text style={styles.footerSummary} numberOfLines={1}>{footer.summary}</Text> : null}
            <PrimaryButton label={footer.label} busy={footer.busy} disabled={footer.disabled} onPress={footer.onPress} />
          </View>
        ) : null}
      </SheetKeyboardAvoidingView>
    </SheetPage>
  );
}

/** The footer's one line about the meal: its grade and the numbers that matter most. */
const summaryOf = (meal: MealAnalysis): string =>
  `Grade ${meal.grade} · ${calorieEstimate(meal.macros)} kcal · ${meal.macros.proteinGrams}g protein`;

/**
 * The meals eaten lately, to log again in one tap: the likeliest first (what
 * was eaten yesterday around now), then the newest. Tapping one picks it and
 * the footer logs it; a stepper sets how much this time.
 */
function RecentMeals({
  meals,
  again,
  onChange,
}: {
  meals: readonly RepeatableMeal[];
  again: { meal: RepeatableMeal; servings: number } | null;
  onChange: (next: { meal: RepeatableMeal; servings: number } | null) => void;
}) {
  if (meals.length === 0) return null;
  return (
    <View style={styles.recent} testID="recent-meals">
      <Text style={styles.recentTitle}>Recent</Text>
      {meals.map((meal) => {
        const on = again?.meal.key === meal.key;
        return (
          <View key={meal.key} style={[styles.recentRow, on && styles.resultOn]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Log ${meal.name} again`}
              onPress={() => onChange(on ? null : { meal, servings: 1 })}
              style={styles.recentMain}
            >
              <View style={styles.resultText}>
                <Text style={styles.resultName} numberOfLines={1}>{meal.name}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>
                  {meal.sameTimeYesterday ? 'Yesterday around now · ' : ''}
                  {calorieEstimate(repeatMeal(meal.analysis, on ? again!.servings : 1).macros).toLocaleString()} kcal · Grade {meal.analysis.grade}
                </Text>
              </View>
              {on ? null : (
                <View style={styles.tick}>
                  <Mark kind="plus" size={12} color={colors.coral} />
                </View>
              )}
            </Pressable>
            {on ? (
              <Stepper
                value={again!.servings}
                label={meal.name}
                onChange={(next) => onChange({ meal, servings: next })}
                onRemove={() => onChange(null)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const MIN_SERVINGS = 0.5;

/**
 * How much of a food, typed: grams or ounces when its serving's weight is
 * known, or servings. Halves on the stepper were the only way, so 180 g of
 * chicken had to be guessed as "2×".
 */
function AmountEditor({ food, servings, onChange }: { food: FoodSearchResult; servings: number; onChange: (servings: number) => void }) {
  const weighed = servingGrams(food) !== undefined;
  const [unit, setUnit] = useState<PortionUnit>(weighed ? 'g' : 'serving');
  const units: PortionUnit[] = weighed ? ['g', 'oz', 'serving'] : ['serving'];
  return (
    <View style={styles.amountEditor} testID="amount-editor">
      <NumberInput
        decimal
        autoFocus
        style={[layout.input, styles.amountInput]}
        value={amountIn(food, servings, unit)}
        onValue={(value) => {
          const next = value === undefined ? null : servingsFrom(food, value, unit);
          if (next !== null && next > 0) onChange(Math.round(next * 100) / 100);
        }}
        accessibilityLabel={`Amount of ${food.name} in ${unit === 'serving' ? 'servings' : unit}`}
      />
      <View style={styles.amountUnits}>
        {units.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: unit === option }}
            onPress={() => setUnit(option)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.slot, unit === option && styles.slotOn]}
          >
            <Text style={[styles.slotLabel, unit === option && styles.slotLabelOn]}>{option === 'serving' ? 'servings' : option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
/** Live search waits for this many letters and this long a pause in typing. */
const LIVE_SEARCH_MIN = 3;
const LIVE_SEARCH_PAUSE_MS = 700;

/**
 * Servings of one food, in halves, from a half up. Taking it off is its own
 * button, set apart: when − at a half removed the food, the list closed up
 * under the finger and the next tap landed on a different one.
 */
function Stepper({
  value,
  label,
  onChange,
  onRemove,
}: {
  value: number;
  label: string;
  onChange: (next: number) => void;
  onRemove: () => void;
}) {
  const atLeast = value <= MIN_SERVINGS;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Less ${label}`}
        accessibilityState={{ disabled: atLeast }}
        disabled={atLeast}
        hitSlop={7}
        onPress={() => onChange(Math.max(MIN_SERVINGS, value - 0.5))}
        style={[styles.stepButton, atLeast && styles.stepButtonOff]}
      >
        <Mark kind="minus" size={10} color={colors.inkSoft} />
      </Pressable>
      <Text style={styles.stepValue}>{`${value}×`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} hitSlop={7} onPress={() => onChange(value + 0.5)} style={styles.stepButton}>
        <Mark kind="plus" size={10} color={colors.inkSoft} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={7} onPress={onRemove} style={styles.stepRemove}>
        <Mark kind="cross" size={10} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** How many servings, and what one serving is ("1 bar (55 g)", "per 100 g"). */
function ServingsRow({
  food,
  servings,
  onChange,
}: {
  food: FoodSearchResult | null;
  servings: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.servingsRow}>
      <Text style={styles.servingsLabel}>Servings{food ? ` · ${food.servingDescription}` : ''}</Text>
      <DoneTextInput
        style={[layout.input, styles.servingsInput]}
        keyboardType="decimal-pad"
        value={servings}
        onChangeText={onChange}
        accessibilityLabel="Servings"
      />
    </View>
  );
}

function AnalysisCard({ analysis }: { analysis: MealAnalysis }) {
  // What this plate will do, shown before it is logged — the same read the
  // toast and the pet will give afterwards, so nothing about it is a surprise.
  const effects = detectFoodEffects({ ...analysis.nutrients, analysis });
  return (
    <View style={styles.analysis}>
      <View style={styles.grade}>
        <Text style={styles.gradeLetter}>{analysis.grade}</Text>
        <Text style={styles.gradeLabel}>PLATE GRADE</Text>
      </View>
      <View style={styles.analysisBody}>
        <Text style={styles.analysisName}>
          {analysis.foodDescription || analysis.detectedFoods.join(', ') || 'Meal detected'}
        </Text>
        <View style={styles.macroLine}>
          {[
            [calorieEstimate(analysis.macros), 'kcal'],
            [`${analysis.macros.proteinGrams}g`, 'protein'],
            [`${analysis.macros.carbsGrams}g`, 'carbs'],
            [`${analysis.macros.fatGrams}g`, 'fat'],
          ].map(([value, label]) => (
            <Text key={String(label)} style={styles.macro}>
              <Text style={styles.macroValue}>{value}</Text>
              <Text style={styles.macroUnit}> {label}</Text>
            </Text>
          ))}
        </View>
        {describeSubMacros(analysis.macros) ? (
          <Text style={styles.subMacros}>{describeSubMacros(analysis.macros)}</Text>
        ) : null}
        {effects.length > 0 ? (
          <View style={styles.effectRow} accessibilityLabel={`Effects: ${effects.map((e) => e.label).join(', ')}`}>
            {effects.map((effect) => (
              <View key={effect.id} style={styles.effectChip}>
                <Text style={styles.effectChipLabel}>{effect.label.toUpperCase()}</Text>
              </View>
            ))}
            <Text style={styles.effectLine} numberOfLines={1}>{effects[0].reaction}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  locked: {
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  lockedTitle: { ...text.heading, fontSize: 21, color: colors.ink },
  lockedBody: { ...text.body, color: colors.muted, lineHeight: 20 },
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 8 },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 22,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tab: { paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.coral },
  tabLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint },
  tabLabelOn: { color: colors.ink },
  body: { padding: 22, paddingBottom: 24 },
  preview: { width: '100%', height: 230, borderRadius: 12, backgroundColor: colors.sage },
  fixBox: { gap: 8, marginTop: 4 },
  fixLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.ink },
  fixInput: { minHeight: 64, textAlignVertical: 'top' },
  fixHint: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, color: colors.faint },
  fixActions: { gap: 6 },
  dropPressed: { opacity: 0.7 },
  dropzone: {
    height: 190,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  // The barcode tab's ask: room for a sentence that may wrap, and a button of
  // its own (pickButton stretches with flex: 1, which in this column made it a
  // tall narrow box).
  permission: { height: undefined, minHeight: 190, paddingVertical: 24, paddingHorizontal: 20 },
  permissionButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  permissionLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.onCoral },
  dropHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, textAlign: 'center' },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  pickLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSoft },
  effectRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  effectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.yellow,
  },
  effectChipLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0, color: colors.yellowDeep },
  effectLine: { fontFamily: fonts.ui, fontSize: 12, color: colors.yellowDeep, marginLeft: 2 },
  analysis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.3)',
    backgroundColor: colors.sageSoft,
  },
  grade: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  gradeLetter: { fontFamily: fonts.ui, fontSize: 34, color: '#fff' },
  gradeLabel: { fontFamily: fonts.ui, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0 },
  analysisBody: { flex: 1 },
  analysisName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink, lineHeight: 23 },
  macroLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  subMacros: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 4 },
  macro: { flexDirection: 'row', alignItems: 'baseline' },
  macroValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  macroUnit: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  actions: { marginTop: 24, gap: 16, alignItems: 'stretch' },
  suggestions: { marginTop: -4, marginBottom: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  suggestion: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  suggestionPressed: { backgroundColor: colors.selectedFill },
  suggestionLabel: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  quick: { marginBottom: 8, padding: 14, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  quickHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickField: { flex: 1, alignItems: 'center', gap: 4 },
  quickInput: { alignSelf: 'stretch', textAlign: 'center' },
  quickLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  quickOpen: { alignItems: 'flex-start', marginBottom: 4 },
  amountLink: { color: colors.coral, fontWeight: '600' },
  amountEditor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  amountInput: { width: 90 },
  amountUnits: { flex: 1, flexDirection: 'row', gap: 6 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  copyPressed: { backgroundColor: colors.selectedFill },
  copyTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  copyMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  // Its own band with a rule under it, drawn over the list: what scrolls up
  // goes under the rule, never through the middle of the pills.
  slots: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    zIndex: 1,
  },
  scrollArea: { flex: 1, overflow: 'hidden' },
  slot: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  slotOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  slotLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft },
  slotLabelOn: { color: colors.onCoral, fontWeight: '600' },
  // Room under the field: the first result sat 1 pt below it.
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  searchInput: { flex: 1 },
  searchButton: {
    backgroundColor: colors.coral,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  searchButtonLabel: { color: '#fff', fontFamily: fonts.ui, fontSize: 13 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  resultOn: { backgroundColor: colors.selectedFill },
  resultText: { flex: 1 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  tickMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: '#fff', lineHeight: 15 },
  plate: { marginTop: 4, marginBottom: 6, padding: 12, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
  plateTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.ink },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateText: { flex: 1 },
  plateName: { fontFamily: fonts.ui, fontSize: 13, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepButtonOff: { opacity: 0.35 },
  stepRemove: { width: 30, height: 30, marginLeft: 6, alignItems: 'center', justifyContent: 'center' },
  stepMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.inkSoft, lineHeight: 15 },
  stepValue: { fontFamily: fonts.ui, fontSize: 13, color: colors.ink, minWidth: 34, textAlign: 'center' },
  recent: { marginTop: 8, gap: 2 },
  recentTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, paddingHorizontal: 6 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6 },
  recentPlus: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral, lineHeight: 20 },
  reading: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 14 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.paper },
  footerSummary: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, textAlign: 'center' },
  resultName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  resultMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 3 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  servingsLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  servingsInput: { width: 90 },
  scanner: { height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  scanHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 12, textAlign: 'center' },
}));
