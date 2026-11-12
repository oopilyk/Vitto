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
import {  detectFoodEffects,type FoodSearchResult, type MealAnalysis, type MealMetadata, type MealPetContext, type RepeatableMeal, forSlot, calorieEstimate, quickAddAnalysis, servingGrams, servingsFrom, amountIn, type PortionUnit, MEAL_SLOTS, MEAL_SLOT_LABEL, slotForTime, type MealSlot, type HealthEvent, type MacroTotals, repeatMeal, describeSubMacros, errorMessage, lookupBarcode, searchFoodsByName, toMealAnalysis, toPlateAnalysis } from '@vitto/core';
import { analyzeMealImage, correctMealAnalysis, shrinkForUpload, type PickedImage } from '../services/mealAnalysis';
import { CloseButton, ErrorText, NumberInput, PressableScale, PrimaryButton, SheetKeyboardAvoidingView, TextButton, DoneTextInput, Mark } from '../components/ui';
import { FatSecretCredit } from '../components/FatSecretCredit';
import { GradeBadge, LogProgress, logHaptic } from '../components/logKit';
import { SegmentedControl } from '../components/settingsKit';
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
  /** Yesterday's meals in a slot, for "Copy yesterday's breakfast" (copyableSlot); empty hides it. */
  copyableFor?: (slot: MealSlot) => readonly HealthEvent<MealMetadata>[];
  /** Logs those meals again, now, in the slot. */
  onCopy?: (meals: readonly HealthEvent<MealMetadata>[], slot: MealSlot) => Promise<void>;
  /** Today's food so far and its targets, for the progress bars at the top; omitted hides them. */
  today?: { consumed: MacroTotals; targets: MacroTotals };
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

export function MealCaptureScreen({ onComplete, onFeedStart, onAnalyzingChange, onClose, petContext, canScanPhotos = true, onOpenPlus, repeatable = [], copyableFor, onCopy, today }: Props) {
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
  const [plate, setPlate] = useState<{ food: FoodSearchResult; servings: number; unit: PortionUnit }[]>([]);
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

  // Results as you type: a real search on each short pause, the last results
  // kept on screen until the next arrive, so Find is rarely needed. (A list of
  // names to pick from first was one step too many.)
  const searched = useRef('');
  const searchCache = useRef(new Map<string, FoodSearchResult[]>());
  useEffect(() => {
    const trimmed = query.trim();
    // Clearing the field goes back to Recent.
    if (mode === 'search' && trimmed === '' && searched.current) {
      searched.current = '';
      setResults([]);
      return undefined;
    }
    if (mode !== 'search' || trimmed.length < LIVE_SEARCH_MIN || busy || trimmed.toLowerCase() === searched.current) return undefined;
    const timer = setTimeout(() => void runSearch(trimmed, true), LIVE_SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, busy]);

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
      logHaptic();
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
        : [...current, { food, servings: 1, unit: defaultUnit(food) }],
    );
  };
  const setPlateServings = (id: string, next: number) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, servings: next } : item)));
  const setPlateUnit = (id: string, unit: PortionUnit) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, unit } : item)));
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

  // What the footer would log, so the bars at the top can show what it adds.
  const pending =
    (mode === 'search' ? quickAnalysis : null) ??
    againAnalysis ??
    (mode === 'photo' && fixText === null ? analysis : null) ??
    (mode === 'search' ? plateAnalysis : null) ??
    (mode === 'scan' ? selectedAnalysis : null);

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
            <Text style={styles.title}>What's on your plate?</Text>
          </View>
          <CloseButton onPress={requestClose} />
        </View>

        {today ? (
          <LogProgress
            items={[
              { label: 'Calories', value: today.consumed.calories, goal: today.targets.calories, adding: pending ? calorieEstimate(pending.macros) : 0, unit: 'kcal' },
              { label: 'Protein', value: today.consumed.proteinGrams, goal: today.targets.proteinGrams, adding: pending?.macros.proteinGrams ?? 0, unit: 'g' },
            ]}
          />
        ) : null}

        <View style={styles.tabs}>
          <SegmentedControl
            options={[
              { value: 'photo' as Mode, label: canScanPhotos ? 'Photo' : 'Photo · Plus' },
              { value: 'search' as Mode, label: 'Search' },
              { value: 'scan' as Mode, label: 'Scan barcode' },
            ]}
            value={mode}
            onChange={(option) => {
              if (option === mode) return;
              setMode(option);
              reset();
              setPlate([]);
              setScanned(false);
            }}
          />
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
              {/* The card IS the camera button: testers tapped the big box again
                  and again, so it opens the camera, and its pill says so. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={image ? 'Retake the photo' : 'Take a photo of your meal'}
                onPress={() => void pick('camera')}
                disabled={busy !== null}
                style={({ pressed }) => pressed && styles.cameraPressed}
                testID="photo-box"
              >
                {image ? (
                  <View>
                    <Image source={{ uri: image.uri }} style={styles.preview} />
                    {/* Read over the photo itself, not in a line under it. */}
                    {busy === 'analyzing' ? (
                      <View style={styles.readingOverlay}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.readingOverlayLabel}>Reading your plate...</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.camera}>
                    <Text style={styles.cameraTitle}>Snap your plate</Text>
                    <Text style={styles.cameraHint}>Vitto reads the food, counts the macros and grades it</Text>
                    {/* A camera's own shutter button, which reads as "tap to shoot" without words. */}
                    <View style={styles.shutter}>
                      <View style={styles.shutterButton} />
                    </View>
                    <Text style={styles.shutterLabel}>Take photo</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.pickRow}>
                {image ? (
                  <PressableScale style={styles.pickButton} onPress={() => pick('camera')}>
                    <Text style={styles.pickLabel}>Retake</Text>
                  </PressableScale>
                ) : null}
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
                  accessibilityLabel="Search foods"
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

              {plate.length > 0 ? (
                <View style={styles.plate} testID="plate">
                  <Text style={styles.plateTitle}>Your plate</Text>
                  {plate.map(({ food, servings: count, unit }) => (
                    <PlateItem
                      key={food.id}
                      food={food}
                      servings={count}
                      unit={unit}
                      onServings={(next) => setPlateServings(food.id, next)}
                      onUnit={(next) => setPlateUnit(food.id, next)}
                      onRemove={() => togglePlate(food)}
                    />
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
                      <Text style={styles.resultName} numberOfLines={2}>{food.name}</Text>
                      <Text style={styles.resultMeta} numberOfLines={1}>{food.servingDescription}</Text>
                    </View>
                    <View style={styles.rowKcalBox}>
                      <Text style={styles.rowKcal}>{food.macros.calories.toLocaleString()}</Text>
                      <Text style={styles.rowKcalUnit}>kcal</Text>
                    </View>
                    <View style={[styles.tick, on && styles.tickOn]}>
                      {on ? <Mark kind="check" size={12} weight={2.2} color="#fff" /> : <Mark kind="plus" size={12} color={colors.coral} />}
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
            {footer.summary ? (
              <View style={styles.footerSummaryRow}>
                {pending ? <GradeBadge grade={pending.grade} size={22} /> : null}
                <Text style={styles.footerSummary} numberOfLines={1}>{footer.summary}</Text>
              </View>
            ) : null}
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
              <GradeBadge grade={meal.analysis.grade} size={30} />
              <View style={styles.resultText}>
                <Text style={styles.resultName} numberOfLines={1}>{meal.name}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>
                  {meal.sameTimeYesterday ? 'Yesterday around now' : `${meal.analysis.macros.proteinGrams}g protein`}
                </Text>
              </View>
              <View style={styles.rowKcalBox}>
                <Text style={styles.rowKcal}>
                  {calorieEstimate(repeatMeal(meal.analysis, on ? again!.servings : 1).macros).toLocaleString()}
                </Text>
                <Text style={styles.rowKcalUnit}>kcal</Text>
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

/** Foods listed per 100 g are thought of in grams; ones with a serving ("1 slice") in servings. */
const defaultUnit = (food: FoodSearchResult): PortionUnit => (food.isPer100g ? 'g' : 'serving');

/** What − and + move by, in each unit. */
const PORTION_STEP: Record<PortionUnit, number> = { g: 10, oz: 0.5, serving: 0.5 };
const UNIT_LABEL: Record<PortionUnit, string> = { g: 'g', oz: 'oz', serving: 'servings' };

/**
 * One food on the plate, with its amount always in reach: − and + by a step
 * of the unit, the number itself to type, and the unit to count it in. The
 * amount is shown in that unit ("30 g"), never as a fraction of a serving: a
 * typed 2 g of cheese used to read "0.08 × 1 slice". Taking it off is its own
 * button, set apart, so a − never removes it from under the finger.
 */
function PlateItem({
  food,
  servings,
  unit,
  onServings,
  onUnit,
  onRemove,
}: {
  food: FoodSearchResult;
  servings: number;
  unit: PortionUnit;
  onServings: (servings: number) => void;
  onUnit: (unit: PortionUnit) => void;
  onRemove: () => void;
}) {
  const weighed = servingGrams(food) !== undefined;
  const units: PortionUnit[] = weighed ? ['g', 'oz', 'serving'] : ['serving'];
  const amount = amountIn(food, servings, unit);
  const step = PORTION_STEP[unit];
  const atLeast = amount <= step;
  const set = (value: number) => {
    const next = servingsFrom(food, value, unit);
    if (next !== null && next > 0) onServings(next);
  };
  return (
    <View style={styles.plateItem} testID="plate-item">
      <View style={styles.plateItemHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.plateName} numberOfLines={2}>{food.name}</Text>
          {unit === 'serving' && !food.isPer100g ? (
            <Text style={styles.resultMeta} numberOfLines={1}>{`1 serving = ${food.servingDescription}`}</Text>
          ) : null}
        </View>
        <View style={styles.rowKcalBox}>
          <Text style={styles.rowKcal}>{Math.round(food.macros.calories * servings).toLocaleString()}</Text>
          <Text style={styles.rowKcalUnit}>kcal</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${food.name}`} hitSlop={8} onPress={onRemove} style={styles.stepRemove}>
          <Mark kind="cross" size={10} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.amountRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Less ${food.name}`}
          accessibilityState={{ disabled: atLeast }}
          disabled={atLeast}
          hitSlop={6}
          onPress={() => set(Math.max(step, Math.round((amount - step) * 10) / 10))}
          style={[styles.stepButton, atLeast && styles.stepButtonOff]}
        >
          <Mark kind="minus" size={10} color={colors.inkSoft} />
        </Pressable>
        <NumberInput
          decimal={unit !== 'g'}
          style={[layout.input, styles.amountInput]}
          value={amount}
          onValue={(value) => {
            if (value !== undefined) set(value);
          }}
          accessibilityLabel={`Amount of ${food.name} in ${UNIT_LABEL[unit]}`}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More ${food.name}`}
          hitSlop={6}
          onPress={() => set(Math.round((amount + step) * 10) / 10)}
          style={styles.stepButton}
        >
          <Mark kind="plus" size={10} color={colors.inkSoft} />
        </Pressable>
        <View style={styles.amountUnits} accessibilityRole="radiogroup" accessibilityLabel="Unit">
          {units.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: unit === option }}
              accessibilityLabel={UNIT_LABEL[option]}
              onPress={() => onUnit(option)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.unitChip, unit === option && styles.unitChipOn]}
            >
              <Text style={[styles.unitLabel, unit === option && styles.unitLabelOn]}>{UNIT_LABEL[option]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Live search waits for this many letters and this long a pause in typing. */
const LIVE_SEARCH_MIN = 3;
const LIVE_SEARCH_PAUSE_MS = 350;

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
        <GradeBadge grade={analysis.grade} size={64} />
        <Text style={styles.gradeLabel}>Plate grade</Text>
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
  title: { ...text.title, marginTop: 6 },
  tabs: { paddingHorizontal: 22, marginTop: 14 },
  body: { padding: 22, paddingBottom: 24 },
  preview: { width: '100%', height: 260, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.sage },
  readingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: 'rgba(28,23,20,0.62)',
  },
  readingOverlayLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: '#fff' },
  // The photo tab's hero: a dark viewfinder-like card, the obvious thing to tap.
  camera: {
    height: 220,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#2b2420',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  cameraPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  // The card's own button, drawn like the iPhone camera's shutter: a ring with a gap, a solid disc inside.
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#fff8ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  shutterButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.coral },
  shutterLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, letterSpacing: 0.3, color: 'rgba(255,248,236,0.85)', marginTop: 8 },
  cameraTitle: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 19, color: '#fff8ec' },
  cameraHint: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: 'rgba(255,248,236,0.7)', textAlign: 'center' },
  fixBox: { gap: 8, marginTop: 4 },
  fixLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.ink },
  fixInput: { minHeight: 64, textAlignVertical: 'top' },
  fixHint: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, color: colors.faint },
  fixActions: { gap: 6 },
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
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: colors.card,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: colors.inkSoft },
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
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  grade: { alignItems: 'center', gap: 6 },
  gradeLabel: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '600', letterSpacing: 0.3, color: colors.muted },
  analysisBody: { flex: 1 },
  analysisName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink, lineHeight: 23 },
  macroLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  subMacros: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 4 },
  macro: { flexDirection: 'row', alignItems: 'baseline' },
  macroValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  macroUnit: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  actions: { marginTop: 24, gap: 16, alignItems: 'stretch' },
  quick: { marginBottom: 8, padding: 14, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  quickHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quickTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickField: { flex: 1, alignItems: 'center', gap: 4 },
  quickInput: { alignSelf: 'stretch', textAlign: 'center' },
  quickLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  quickOpen: { alignItems: 'flex-start', marginBottom: 4 },
  plateItem: { gap: 10, paddingVertical: 4 },
  plateItemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: { width: 72, minHeight: 40, paddingVertical: 8, textAlign: 'center', fontSize: 16 },
  amountUnits: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 2 },
  unitChip: { minHeight: 30, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  unitChipOn: { backgroundColor: colors.selectedFill },
  unitLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  unitLabelOn: { color: colors.coralDeep, fontWeight: '700' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  copyPressed: { backgroundColor: colors.selectedFill },
  copyTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  copyMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  // Its own band with a rule under it, drawn over the list: what scrolls up
  // goes under the rule, never through the middle of the pills.
  slots: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    zIndex: 1,
  },
  scrollArea: { flex: 1, overflow: 'hidden' },
  // Light chips under the segmented control: one choice of four, never louder than it.
  slot: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  slotOn: { backgroundColor: colors.selectedFill },
  slotLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  slotLabelOn: { color: colors.coralDeep, fontWeight: '700' },
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
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, borderCurve: 'continuous' },
  resultOn: { backgroundColor: colors.selectedFill },
  // The calories stacked over their unit, right-aligned like a price.
  rowKcalBox: { alignItems: 'flex-end', minWidth: 44 },
  rowKcal: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 15, color: colors.ink, fontVariant: ['tabular-nums'] },
  rowKcalUnit: { fontFamily: fonts.ui, fontSize: 11, color: colors.faint },
  resultText: { flex: 1 },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.coralWash, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  tickMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: '#fff', lineHeight: 15 },
  plate: { marginTop: 4, marginBottom: 10, padding: 14, gap: 12, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.card },
  plateTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  plateName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardSoft, alignItems: 'center', justifyContent: 'center' },
  stepButtonOff: { opacity: 0.35 },
  stepRemove: { width: 30, height: 30, marginLeft: 6, alignItems: 'center', justifyContent: 'center' },
  stepMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.inkSoft, lineHeight: 15 },
  stepValue: { fontFamily: fonts.ui, fontSize: 13, color: colors.ink, minWidth: 34, textAlign: 'center' },
  recent: { marginTop: 18, gap: 2 },
  recentTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, paddingHorizontal: 8 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8, borderRadius: 14, borderCurve: 'continuous' },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 8 },
  recentPlus: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral, lineHeight: 20 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.paper },
  footerSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  footerSummary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  resultName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  resultMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 3 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  servingsLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  servingsInput: { width: 90 },
  scanner: { height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  scanHint: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 12, textAlign: 'center' },
}));
