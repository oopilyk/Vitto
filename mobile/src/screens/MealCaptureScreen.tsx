import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {  detectFoodEffects,type FoodSearchResult, type MealAnalysis, type MealMetadata, type MealPetContext, calorieEstimate, describeSubMacros, errorMessage, lookupBarcode, searchFoodsByName, toMealAnalysis, toPlateAnalysis } from '@vitto/core';
import { analyzeMealImage, correctMealAnalysis, shrinkForUpload, type PickedImage } from '../services/mealAnalysis';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
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

export function MealCaptureScreen({ onComplete, onFeedStart, onAnalyzingChange, onClose, petContext, canScanPhotos = true, onOpenPlus }: Props) {
  const [mode, setMode] = useState<Mode>(canScanPhotos ? 'photo' : 'search');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [busy, setBusy] = useState<'analyzing' | 'fixing' | 'saving' | 'searching' | null>(null);
  /** What the person says the plate really was, while they correct the AI; null when not correcting. */
  const [fixText, setFixText] = useState<string | null>(null);
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

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  /** The close-focus camera for barcodes, once the phone has said which it has. */
  const [scanLens, setScanLens] = useState<string | undefined>(undefined);

  const reset = () => {
    setAnalysis(null);
    setFixText(null);
    setSelected(null);
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

  const runSearch = async () => {
    // Searching is done typing: the results go where the keyboard was.
    Keyboard.dismiss();
    // A search already in flight is not re-fired: the food APIs are rate limited
    // per IP, so an impatient second tap spends quota that the first request is
    // already waiting on.
    if (!query.trim() || busy) return;
    setBusy('searching');
    setError(null);
    try {
      const found = await searchFoodsByName(query);
      setResults(found);
      if (found.length === 0) setError('No foods matched that search.');
    } catch (cause) {
      setError(errorMessage(cause, 'Food search failed.'));
    } finally {
      setBusy(null);
    }
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
      await onComplete({ ...next.nutrients, analysis: next, loggedVia });
      onFeedStart(loggedVia === 'ai' ? (image?.uri ?? null) : null, next.grade);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this meal.'));
    } finally {
      setBusy(null);
    }
  };

  const onPlate = (food: FoodSearchResult) => plate.some((item) => item.food.id === food.id);
  const togglePlate = (food: FoodSearchResult) =>
    setPlate((current) =>
      current.some((item) => item.food.id === food.id)
        ? current.filter((item) => item.food.id !== food.id)
        : [...current, { food, servings: 1 }],
    );
  const setPlateServings = (id: string, next: number) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, servings: next } : item)));
  const plateAnalysis = plate.length > 0 ? toPlateAnalysis(plate) : null;

  const selectedAnalysis = selected
    ? toMealAnalysis(selected, Math.max(0.1, Number(servings) || 1))
    : null;

  // The one thing to do next, pinned under the page so it is never a scroll
  // away: log the meal, or (photo) say it is being read or offer a retry.
  const footer: { label: string; summary?: string; busy?: boolean; disabled?: boolean; onPress: () => void } | null =
    mode === 'photo' && canScanPhotos
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

  return (
    <SheetPage onBackPress={onClose}>
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View>
            <Kicker>Nourishment check</Kicker>
            <Text style={styles.title}>What's on your plate?</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
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

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
                <Pressable style={styles.pickButton} onPress={() => pick('camera')}>
                  <Text style={styles.pickLabel}>Take photo</Text>
                </Pressable>
                <Pressable style={styles.pickButton} onPress={() => pick('library')}>
                  <Text style={styles.pickLabel}>Choose from library</Text>
                </Pressable>
              </View>

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
                <Pressable style={styles.searchButton} onPress={() => void runSearch()}>
                  {busy === 'searching' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.searchButtonLabel}>Find</Text>
                  )}
                </Pressable>
              </View>

              {plate.length > 0 ? (
                <View style={styles.plate} testID="plate">
                  <Text style={styles.plateTitle}>Your plate</Text>
                  {plate.map(({ food, servings: count }) => (
                    <View key={food.id} style={styles.plateRow}>
                      <View style={styles.plateText}>
                        <Text style={styles.plateName} numberOfLines={1}>{food.name}</Text>
                        <Text style={styles.resultMeta} numberOfLines={1}>
                          {Math.round(food.macros.calories * count)} kcal · {food.servingDescription}
                        </Text>
                      </View>
                      <Stepper
                        value={count}
                        label={food.name}
                        onChange={(next) => (next > 0 ? setPlateServings(food.id, next) : togglePlate(food))}
                      />
                    </View>
                  ))}
                </View>
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
                      {on ? <Text style={styles.tickMark}>✓</Text> : null}
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
                <View style={styles.dropzone}>
                  <Text style={styles.dropTitle}>Camera access needed</Text>
                  <Text style={styles.dropHint}>To scan a barcode, allow the camera.</Text>
                  <Pressable style={styles.pickButton} onPress={() => void requestPermission()}>
                    <Text style={styles.pickLabel}>Allow camera</Text>
                  </Pressable>
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
      </KeyboardAvoidingView>
    </SheetPage>
  );
}

/** The footer's one line about the meal: its grade and the numbers that matter most. */
const summaryOf = (meal: MealAnalysis): string =>
  `Grade ${meal.grade} · ${calorieEstimate(meal.macros)} kcal · ${meal.macros.proteinGrams}g protein`;

/** Servings of one food on the plate, in halves; below a half takes it off. */
function Stepper({ value, label, onChange }: { value: number; label: string; onChange: (next: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Less ${label}`} hitSlop={6} onPress={() => onChange(value - 0.5)} style={styles.stepButton}>
        <Text style={styles.stepMark}>{value <= 0.5 ? '×' : '−'}</Text>
      </Pressable>
      <Text style={styles.stepValue}>{`${value}×`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} hitSlop={6} onPress={() => onChange(value + 0.5)} style={styles.stepButton}>
        <Text style={styles.stepMark}>+</Text>
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
      <TextInput
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
    borderRadius: 4,
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
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 8 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: { fontFamily: fonts.pixel, fontSize: 31, color: colors.muted, lineHeight: 36 },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 22,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  tab: { paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.coral },
  tabLabel: { fontFamily: fonts.pixel, fontSize: 16, color: colors.faint },
  tabLabelOn: { color: colors.ink },
  body: { padding: 22, paddingBottom: 24 },
  preview: { width: '100%', height: 230, borderRadius: 4, backgroundColor: colors.sage },
  fixBox: { gap: 8, marginTop: 4 },
  fixLabel: { fontFamily: fonts.pixelBold, fontSize: 16, color: colors.ink },
  fixInput: { minHeight: 64, textAlignVertical: 'top' },
  fixHint: { fontFamily: fonts.pixel, fontSize: 13, lineHeight: 18, color: colors.faint },
  fixActions: { gap: 6 },
  dropPressed: { opacity: 0.7 },
  dropzone: {
    height: 190,
    borderRadius: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropTitle: { fontFamily: fonts.pixelBold, fontSize: 22, color: colors.ink },
  dropHint: { fontFamily: fonts.pixel, fontSize: 14, color: colors.faint },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  pickLabel: { fontFamily: fonts.pixel, fontSize: 14, color: colors.inkSoft },
  effectRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  effectChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.yellow,
  },
  effectChipLabel: { fontFamily: fonts.pixel, fontSize: 12, letterSpacing: 1, color: colors.yellowDeep },
  effectLine: { fontFamily: fonts.pixel, fontSize: 14, color: colors.yellowDeep, marginLeft: 2 },
  analysis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 4,
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
  gradeLetter: { fontFamily: fonts.pixel, fontSize: 39, color: '#fff' },
  gradeLabel: { fontFamily: fonts.pixel, fontSize: 9, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6 },
  analysisBody: { flex: 1 },
  analysisName: { fontFamily: fonts.pixelBold, fontSize: 20, color: colors.ink, lineHeight: 26 },
  macroLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  subMacros: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 22, color: colors.muted, marginTop: 4 },
  macro: { flexDirection: 'row', alignItems: 'baseline' },
  macroValue: { fontFamily: fonts.pixelBold, fontSize: 21, color: colors.ink },
  macroUnit: { fontFamily: fonts.pixel, fontSize: 13, color: colors.muted },
  actions: { marginTop: 24, gap: 16, alignItems: 'stretch' },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1 },
  searchButton: {
    backgroundColor: colors.coral,
    borderRadius: 4,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  searchButtonLabel: { color: '#fff', fontFamily: fonts.pixel, fontSize: 16 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  resultOn: { backgroundColor: colors.selectedFill },
  resultText: { flex: 1 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  tickMark: { fontFamily: fonts.pixelBold, fontSize: 15, color: '#fff', lineHeight: 18 },
  plate: { marginTop: 14, marginBottom: 6, padding: 12, gap: 10, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardSoft },
  plateTitle: { fontFamily: fonts.pixelBold, fontSize: 15, color: colors.ink },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateText: { flex: 1 },
  plateName: { fontFamily: fonts.pixel, fontSize: 16, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepMark: { fontFamily: fonts.pixelBold, fontSize: 17, color: colors.inkSoft, lineHeight: 20 },
  stepValue: { fontFamily: fonts.pixel, fontSize: 15, color: colors.ink, minWidth: 34, textAlign: 'center' },
  reading: { fontFamily: fonts.pixel, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 14 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.paper },
  footerSummary: { fontFamily: fonts.pixel, fontSize: 14, color: colors.muted, textAlign: 'center' },
  resultName: { fontFamily: fonts.pixel, fontSize: 18, color: colors.ink },
  resultMeta: { fontFamily: fonts.pixel, fontSize: 13, color: colors.faint, marginTop: 3 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  servingsLabel: { fontFamily: fonts.pixel, fontSize: 14, color: colors.muted },
  servingsInput: { width: 90 },
  scanner: { height: 280, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000' },
  scanHint: { fontFamily: fonts.pixel, fontSize: 14, color: colors.faint, marginTop: 12, textAlign: 'center' },
}));
