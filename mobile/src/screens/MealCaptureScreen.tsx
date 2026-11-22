import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View, Alert, Keyboard, Platform } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import {  MAX_SAVED_MEAL_NAME, detectFoodEffects,type FoodSearchResult, type MealAnalysis, type MealMetadata, type MealPetContext, type RepeatableMeal, forSlot, calorieEstimate, quickAddAnalysis, servingGrams, servingsFrom, amountIn, type PortionUnit, MEAL_SLOT_LABEL, slotForTime, type MealSlot, type HealthEvent, type MacroTotals, repeatMeal, describeSubMacros, errorMessage, lookupBarcode, searchFoodsByName, toMealAnalysis, toPlateAnalysis, describeMeal, MAX_MEAL_TEXT_LENGTH } from '@vitto/core';
import { analyzeMealImage, correctMealAnalysis, shrinkForUpload, type PickedImage } from '../services/mealAnalysis';
import { CloseButton, ErrorText, NumberInput, PressableScale, PrimaryButton, TextButton, DoneTextInput, Mark, haptic, useKeyboardLift } from '../components/ui';
import { MealCamera, type CameraMode, type CameraShot } from '../components/MealCamera';
import { canDictate, useDictation } from '../services/dictation';
import { FatSecretCredit } from '../components/FatSecretCredit';
import { GradeBadge, LogProgress, logHaptic } from '../components/logKit';
import { SegmentedControl } from '../components/settingsKit';
import { cacheSearch, cachedSearch, loadRecentFoods, localSuggestions, rememberFood } from '../services/foodSuggestions';
import { colors, fonts, layout, text, themedStyles } from '../theme';
import { RoomWindowSlot, useRoomKeyboardGap, useScrollToWindowOnLog } from '../petWorld/RoomPanel';

interface Props {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (analyzing: boolean) => void;
  onClose: () => void;
  /** Who is about to eat this, so the photo analysis can come back with their reaction. */
  petContext?: MealPetContext;
  /**
   * Photo macro tracking is Plus. False marks the camera's shutter as a Plus
   * feature (barcodes still scan) and opens on Search instead. Defaults to true.
   */
  canScanPhotos?: boolean;
  /** Opens the Plus paywall from the camera's locked shutter. */
  onOpenPlus?: () => void;
  /** Meals to log again in one tap (repeatableMeals), newest first. */
  repeatable?: readonly RepeatableMeal[];
  /** Yesterday's meals in a slot, for "Copy yesterday's breakfast" (copyableSlot); empty hides it. */
  copyableFor?: (slot: MealSlot) => readonly HealthEvent<MealMetadata>[];
  /** Logs those meals again, now, in the slot. */
  onCopy?: (meals: readonly HealthEvent<MealMetadata>[], slot: MealSlot) => Promise<void>;
  /** Today's food so far and its targets, for the progress bars at the top; omitted hides them. */
  today?: { consumed: MacroTotals; targets: MacroTotals };
  /**
   * Which way in to open on: the Kitchen's page has a button for each. Defaults
   * to the camera, or search without Plus. `camera` opens the camera as it was
   * last used; `photo` and `scan` open it on that mode. `recent` is search with
   * the keyboard down, so the meals eaten lately are what shows. `describe` is
   * the meal said or typed in a sentence.
   */
  initialMode?: 'camera' | 'photo' | 'scan' | 'search' | 'recent' | 'describe';
  /**
   * Opened in the Kitchen's page: its pinned bar switches between search, the
   * camera and describing, so there is no switch, title, × or progress card
   * here, only the logging itself.
   */
  inRoom?: boolean;
  /**
   * Keeps a plate built in search as a saved meal as it is logged (its "Keep in
   * Meals" tick), so the same plate is one tap next time from the Kitchen's
   * Meals tab. Resolves to why it could not be kept, or null.
   */
  onSaveMeal?: (name: string, analysis: MealAnalysis) => Promise<string | null>;
}

type Mode = 'camera' | 'search' | 'describe';

export { closeUpLens } from '../components/MealCamera';

/**
 * The camera opens on the mode it was last used in, on this phone: someone who
 * scans a protein bar every morning should not have to leave Photo each time.
 */
const CAMERA_MODE_KEY = 'vitto.mealCamera.mode';
let lastCameraMode: CameraMode | null = null;
const cameraModeLoaded: Promise<void> = AsyncStorage.getItem(CAMERA_MODE_KEY)
  .then((stored) => {
    if (stored === 'barcode' || stored === 'photo') lastCameraMode ??= stored;
  })
  .catch(() => undefined);
const rememberCameraMode = (mode: CameraMode) => {
  lastCameraMode = mode;
  void AsyncStorage.setItem(CAMERA_MODE_KEY, mode).catch(() => undefined);
};

/** How long the barcode frame stays green on a find before the camera gives way to the food. */
const FOUND_BEAT_MS = 550;
/** How long the camera's page takes to slide away on iOS, before another can be shown. */
const CAMERA_DISMISS_MS = 450;
/** How long a barcode that was not found is left alone before it is looked up again. */
const UNKNOWN_BARCODE_REST_MS = 5000;

/** What reading a photo says while it works, one step every READING_STEP_MS. */
const READING_STEPS = ['Spotting the foods...', 'Sizing up portions...', 'Counting it up...'];
const READING_STEP_MS = 1800;

export function MealCaptureScreen({ onComplete, onFeedStart, onAnalyzingChange, onClose, petContext, canScanPhotos = true, onOpenPlus, repeatable = [], copyableFor, onCopy, today, initialMode, inRoom, onSaveMeal }: Props) {
  // Which meal of the day this is, read off the clock. There is no picker: a
  // row of Breakfast / Lunch / Dinner / Snack on every log was a question
  // nobody needed to answer, and the clock is right nearly always.
  const [slot] = useState<MealSlot>(() => slotForTime(new Date()));
  const [mode, setMode] = useState<Mode>(
    initialMode === 'recent' ? 'search' : initialMode === 'photo' || initialMode === 'scan' ? 'camera' : (initialMode ?? (canScanPhotos ? 'camera' : 'search')),
  );
  // The camera's two modes. Asked for outright (a Photo or Scan way in), else
  // as it was last used, else whichever this account can use: photos are Plus.
  const camAsked = useRef(initialMode === 'photo' || initialMode === 'scan');
  const [cam, setCamState] = useState<CameraMode>(
    initialMode === 'photo' ? 'photo' : initialMode === 'scan' ? 'barcode' : (lastCameraMode ?? (canScanPhotos ? 'photo' : 'barcode')),
  );
  const camNow = useRef(cam);
  camNow.current = cam;
  useEffect(() => {
    let mounted = true;
    // The stored mode can arrive after the first open of a session.
    void cameraModeLoaded.then(() => {
      if (mounted && !camAsked.current && lastCameraMode && lastCameraMode !== camNow.current) setCamState(lastCameraMode);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const photoMode = mode === 'camera' && cam === 'photo';
  const scanMode = mode === 'camera' && cam === 'barcode';
  // The camera is a page of its own over this one. It comes up at once when the
  // camera was what was asked for (the Kitchen's Camera button); a sheet that
  // merely opens on the camera's tab waits to be asked, behind "Open camera".
  const [cameraOpen, setCameraOpen] = useState(initialMode === 'camera' || initialMode === 'photo' || initialMode === 'scan');
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closing.current) clearTimeout(closing.current);
  }, []);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [busy, setBusy] = useState<'analyzing' | 'fixing' | 'saving' | 'searching' | 'describing' | null>(null);
  // A photo takes a few seconds to read. Saying what is happening, a step at a
  // time, makes the wait feel like work being done rather than a stall. It
  // stays on the last step if the reply is slow.
  const [readingStep, setReadingStep] = useState(0);
  useEffect(() => {
    if (busy !== 'analyzing') return;
    setReadingStep(0);
    const timer = setInterval(() => setReadingStep((step) => Math.min(step + 1, READING_STEPS.length - 1)), READING_STEP_MS);
    return () => clearInterval(timer);
  }, [busy]);
  const readingLabel = READING_STEPS[readingStep]!;
  /** What the person says the plate really was, while they correct the AI; null when not correcting. */
  const [fixText, setFixText] = useState<string | null>(null);
  // The fix box is the last thing on the photo page, so it opened straight
  // under the keyboard: once the sheet has shrunk above the keyboard, the
  // page is scrolled down to it.
  const scroll = useRef<ScrollView>(null);
  // In a room: back up to the pet when something is logged.
  useScrollToWindowOnLog(scroll);
  const fixing = fixText !== null;
  useEffect(() => {
    if (!fixing) return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => shown.remove();
  }, [fixing]);
  const [error, setError] = useState<string | null>(null);

  // On iPhone nothing is laid out again for the keyboard: it slides over the
  // page, the scroller takes iOS's own keyboard insets (which move with the
  // keys, as the chat's do) and the Log button rides up on the keys. Shrinking
  // the page above the keyboard instead made it trail behind them.
  const rides = Platform.OS === 'ios';
  const lift = useKeyboardLift(useRoomKeyboardGap());
  const [footerHeight, setFooterHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  /** Where the search field sits in the page, under the room's window. */
  const [searchTop, setSearchTop] = useState(0);

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

  const [scanned, setScanned] = useState(false);

  const reset = () => {
    setAnalysis(null);
    setFixText(null);
    setSelected(null);
    setAgain(null);
    setError(null);
  };

  /** Photo logging is Plus: the camera's shutter and library button go here without it. */
  const lockedPhoto = () => {
    // The paywall opens on the page under the camera.
    setCameraOpen(false);
    if (onOpenPlus) onOpenPlus();
    else setError('Photo meal tracking is part of Vitto Plus. Search, scan a barcode or describe your meal instead.');
  };

  const pickFromLibrary = async () => {
    if (!canScanPhotos) {
      lockedPhoto();
      return;
    }
    reset();
    // iOS shows one page over the app at a time: with the camera's page up, the
    // library never appeared at all. So the camera goes first, and comes back
    // if nothing is chosen.
    const fromCamera = cameraOpen;
    if (fromCamera) {
      setCameraOpen(false);
      if (Platform.OS === 'ios') await new Promise((resolve) => setTimeout(resolve, CAMERA_DISMISS_MS));
    }
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      setError('Photo access is off. Enable it in Settings to choose a meal photo.');
      return;
    }
    // base64 keeps the bytes in hand, so nothing has to read the file back later.
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'], base64: true });
    if (picked.canceled || !picked.assets?.length) {
      if (fromCamera) setCameraOpen(true);
      return;
    }

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

  /** The shutter's photo: read straight away, as a chosen one is. */
  const onShot = async (shot: CameraShot) => {
    reset();
    // Taken: the camera goes away and the page shows the photo being read.
    setCameraOpen(false);
    const shrunk = await shrinkForUpload({ ...shot, mimeType: 'image/jpeg' });
    setImage(shrunk);
    await analyze(shrunk);
  };

  /** Back to the camera for another go. */
  const retake = () => {
    if (busy) return;
    reset();
    setImage(null);
    setCameraOpen(true);
  };

  /**
   * The camera's ×. In the Kitchen, with nothing taken, that is leaving the
   * Camera tab: its page would be empty. Elsewhere the page offers the way back in.
   */
  const closeCamera = () => {
    setCameraOpen(false);
    setError(null);
    if (inRoom && !image && !selected) onClose();
  };

  const setCam = (next: CameraMode) => {
    if (closing.current) clearTimeout(closing.current);
    camAsked.current = true;
    rememberCameraMode(next);
    setCamState(next);
    reset();
    setScanned(false);
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
    // Each term goes to the server once a session (60 searches an hour per account).
    const cached = cachedSearch(trimmed);
    if (cached) {
      setResults(withKnown(trimmed, cached));
      if (cached.length === 0 && !live) setError('No foods matched that search.');
      return;
    }
    setBusy('searching');
    try {
      const found = await searchFoodsByName(trimmed);
      const list = Array.isArray(found) ? found : [];
      cacheSearch(trimmed, list);
      // Typed on while it was asked: the answer is for a term no longer there.
      if (live && latestQuery.current.trim().toLowerCase() !== trimmed.toLowerCase()) return;
      setResults(withKnown(trimmed, list));
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
  const latestQuery = useRef(query);
  latestQuery.current = query;
  useEffect(() => {
    void loadRecentFoods();
  }, []);
  // On every keystroke, before the database answers: what is already known
  // that matches (foods put on a plate before, and every answer this session).
  useEffect(() => {
    const trimmed = query.trim();
    if (mode !== 'search' || !trimmed) return;
    const known = cachedSearch(trimmed);
    setResults(known ? withKnown(trimmed, known) : localSuggestions(trimmed));
  }, [mode, query]);
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

  /** The database's answer with the foods they have had before that match, leading. */
  function withKnown(term: string, list: FoodSearchResult[]): FoodSearchResult[] {
    const known = localSuggestions(term, 4).filter((food) => !list.some((candidate) => candidate.id === food.id));
    return [...known, ...list];
  }

  /** A barcode no database had, and when: the camera still sees it many times a second. */
  const unknownBarcode = useRef<{ data: string; at: number } | null>(null);
  const onBarcode = async ({ data }: { data: string }) => {
    if (scanned || busy) return;
    // Still pointed at the one just looked up and not found: asking again every
    // frame would spend the account's searches on the same "no".
    if (unknownBarcode.current?.data === data && Date.now() - unknownBarcode.current.at < UNKNOWN_BARCODE_REST_MS) return;
    setScanned(true);
    setBusy('searching');
    setError(null);
    try {
      const found = await lookupBarcode(data);
      if (!found) {
        unknownBarcode.current = { data, at: Date.now() };
        setError(`No food found for barcode ${data}.`);
        setScanned(false);
      } else {
        haptic('press');
        setSelected(found);
        setServings('1');
        // A beat on the green frame, so it is seen to have been found, then
        // back to the page, where the food and its servings are.
        closing.current = setTimeout(() => setCameraOpen(false), FOUND_BEAT_MS);
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
  const searchInput = useRef<TextInput>(null);
  const togglePlate = (food: FoodSearchResult) => {
    setAgain(null);
    const adding = !plate.some((item) => item.food.id === food.id);
    setPlate((current) =>
      current.some((item) => item.food.id === food.id)
        ? current.filter((item) => item.food.id !== food.id)
        : [...current, { food, servings: startingServings(food), unit: defaultUnit(food) }],
    );
    // A plate is built one search at a time: sweet potato, then rice, then
    // steak. So the field clears for the next food, still focused.
    if (adding) {
      rememberFood(food);
      setQuery('');
      searchInput.current?.focus();
    }
  };
  const setPlateServings = (id: string, next: number) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, servings: next } : item)));
  const setPlateUnit = (id: string, unit: PortionUnit) =>
    setPlate((current) => current.map((item) => (item.food.id === id ? { ...item, unit } : item)));
  const plateAnalysis = plate.length > 0 ? toPlateAnalysis(plate) : null;
  /** The plate's "Keep in Meals" tick, and its name (typed, or its foods'). */
  const [keepPlate, setKeepPlate] = useState(false);
  const [plateName, setPlateName] = useState('');
  const autoPlateName = plate
    .map(({ food }) => food.name.split(/[,(·]/)[0]!.trim())
    .slice(0, 3)
    .join(', ')
    .slice(0, MAX_SAVED_MEAL_NAME);
  /** Logs the plate, keeping it in Meals first when ticked (a refusal there never stops the log). */
  const logPlate = async (analysisOfPlate: MealAnalysis) => {
    if (keepPlate && onSaveMeal) {
      await onSaveMeal(plateName.trim() || autoPlateName, analysisOfPlate).catch(() => null);
    }
    await saveAnalysis(analysisOfPlate, 'manual');
  };

  const selectedAnalysis = selected
    ? toMealAnalysis(selected, Math.max(0.1, Number(servings) || 1))
    : null;

  // Describe: the meal said or typed in a sentence. What it is read as goes on
  // the plate, the same plate Search builds, to be checked before it is logged.
  const [describeText, setDescribeText] = useState('');
  /** What was said that could not be found, told once under the box. */
  const [describeNote, setDescribeNote] = useState<string | null>(null);
  /** What was in the box when the mic went on: speech is added after it. */
  const spokenAfter = useRef('');
  const dictation = useDictation((heard) =>
    setDescribeText(`${spokenAfter.current}${spokenAfter.current && heard ? ' ' : ''}${heard}`.slice(0, MAX_MEAL_TEXT_LENGTH)),
  );
  const toggleMic = () => {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    spokenAfter.current = describeText.trim();
    void dictation.start();
  };
  /** The search the box's own reading uses: an answer already had this session is not asked for twice. */
  const searchOnce = async (term: string): Promise<FoodSearchResult[]> => {
    const known = cachedSearch(term);
    if (known) return known;
    const found = await searchFoodsByName(term);
    cacheSearch(term, found);
    return found;
  };
  const describe = async () => {
    const said = describeText.trim();
    if (!said || busy) return;
    dictation.stop();
    Keyboard.dismiss();
    setBusy('describing');
    setError(null);
    setDescribeNote(null);
    try {
      const meal = await describeMeal(said, { search: searchOnce });
      // Onto the plate, after whatever is on it: "and a coke" adds to the meal.
      setPlate((current) =>
        meal.items.reduce(
          (next, item) =>
            next.some((entry) => entry.food.id === item.food.id)
              ? next.map((entry) => (entry.food.id === item.food.id ? { ...entry, servings: entry.servings + item.servings } : entry))
              : [...next, { food: item.food, servings: item.servings, unit: item.unit }],
          current,
        ),
      );
      meal.items.forEach(({ food }) => {
        if (food.source !== 'estimate') rememberFood(food);
      });
      setDescribeText('');
      setDescribeNote(meal.missed.length > 0 ? `Could not work out ${meal.missed.join(', ')}. Add it from Search.` : null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not read that meal. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  // The one thing to do next, pinned under the page so it is never a scroll
  // away: log the meal, or (photo) say it is being read or offer a retry.
  const quickAnalysis =
    quick && quick.calories !== undefined && quick.calories > 0 && quick.calories <= 10000
      ? quickAddAnalysis({ ...quick, calories: quick.calories })
      : null;
  const footer: { label: string; summary?: string; busy?: boolean; disabled?: boolean; onPress: () => void } | null =
    mode === 'search' && quickAnalysis
      ? {
          label: busy === 'saving' ? 'Saving...' : 'Log meal',
          summary: summaryOf(quickAnalysis),
          busy: busy === 'saving',
          onPress: () => void saveAnalysis(quickAnalysis, 'manual'),
        }
      : againAnalysis
      ? {
          label: busy === 'saving' ? 'Saving...' : 'Log meal',
          summary: summaryOf(againAnalysis),
          busy: busy === 'saving',
          // A repeat is typed in, not read from a photo or a barcode.
          onPress: () => void saveAnalysis(againAnalysis, 'manual'),
        }
      : photoMode && canScanPhotos
      ? busy === 'analyzing'
        ? { label: readingLabel, busy: true, disabled: true, onPress: () => {} }
        : analysis && fixText === null
          ? { label: busy === 'saving' ? 'Saving...' : 'Log meal', summary: summaryOf(analysis), busy: busy === 'saving', onPress: () => void saveAnalysis(analysis, 'ai') }
          : image && !analysis
            ? { label: 'Try again', onPress: () => void analyze() }
            : null
      : (mode === 'search' || mode === 'describe') && plateAnalysis
        ? {
            label: busy === 'saving' ? 'Saving...' : plate.length === 1 ? 'Log meal' : `Add ${plate.length} foods`,
            summary: summaryOf(plateAnalysis),
            busy: busy === 'saving',
            onPress: () => void logPlate(plateAnalysis),
          }
        : scanMode && selectedAnalysis
          ? { label: busy === 'saving' ? 'Saving...' : 'Log meal', summary: summaryOf(selectedAnalysis), busy: busy === 'saving', onPress: () => void saveAnalysis(selectedAnalysis, 'barcode') }
          : null;

  // What the footer would log, so the bars at the top can show what it adds.
  const pending =
    (mode === 'search' ? quickAnalysis : null) ??
    againAnalysis ??
    (photoMode && fixText === null ? analysis : null) ??
    (mode === 'search' || mode === 'describe' ? plateAnalysis : null) ??
    (scanMode ? selectedAnalysis : null);

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

  /** The foods chosen so far, each with its amount: Search and Describe both fill it. */
  const plateCard =
    plate.length > 0 ? (
      <View style={styles.plate} testID="plate">
        <View style={styles.plateHead}>
          <Text style={styles.plateTitle}>Your plate</Text>
          {plateAnalysis ? (
            <Text style={styles.plateTotal}>
              {`${plate.length} ${plate.length === 1 ? 'food' : 'foods'} · ${calorieEstimate(plateAnalysis.macros).toLocaleString('en-US')} kcal · ${Math.round(plateAnalysis.macros.proteinGrams)}g protein`}
            </Text>
          ) : null}
        </View>
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
        {/* The same plate every day: keep it, and it is one tap from Meals. */}
        {onSaveMeal ? (
          <View style={styles.keepBox}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: keepPlate }}
              accessibilityLabel="Keep this plate in Meals"
              onPress={() => setKeepPlate((on) => !on)}
              hitSlop={6}
              style={styles.keepRow}
            >
              <View style={[styles.keepTick, keepPlate && styles.keepTickOn]}>
                {keepPlate ? <Mark kind="check" size={11} weight={2.2} color={colors.onCoral} /> : null}
              </View>
              <Text style={styles.keepLabel}>Keep in Meals for next time</Text>
            </Pressable>
            {keepPlate ? (
              <TextInput
                style={[layout.input, styles.keepName]}
                value={plateName}
                onChangeText={setPlateName}
                placeholder={autoPlateName || 'Name it'}
                placeholderTextColor={colors.faint}
                accessibilityLabel="Name for this plate in Meals"
                maxLength={MAX_SAVED_MEAL_NAME}
                returnKeyType="done"
              />
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <SheetPage onBackPress={requestClose}>
      {/* In the room the window is right above: no gap for a title that is not there. */}
      <View style={[styles.sheet, inRoom && { paddingTop: 0 }]}>
        {inRoom ? null : (
          <View style={styles.header}>
            {/* Flexed, so a long title at large text wraps instead of pushing × off the sheet. */}
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>What's on your plate?</Text>
            </View>
            <CloseButton onPress={requestClose} />
          </View>
        )}

        {today && !inRoom ? (
          <LogProgress
            items={[
              { label: 'Calories', value: today.consumed.calories, goal: today.targets.calories, adding: pending ? calorieEstimate(pending.macros) : 0, unit: 'kcal' },
              { label: 'Protein', value: today.consumed.proteinGrams, goal: today.targets.proteinGrams, adding: pending?.macros.proteinGrams ?? 0, unit: 'g' },
            ]}
          />
        ) : null}

        {inRoom ? null : (
          <View style={styles.tabs}>
            <SegmentedControl
              options={[
                { value: 'camera' as Mode, label: 'Camera' },
                { value: 'search' as Mode, label: 'Search' },
                { value: 'describe' as Mode, label: 'Describe' },
              ]}
              value={mode}
              onChange={(option) => {
                if (option === mode) return;
                dictation.stop();
                setMode(option);
                reset();
                // Search and Describe build the same plate: it is kept between them.
                if (option === 'camera') setPlate([]);
                setScanned(false);
                // Choosing the camera is asking for it.
                if (option === 'camera' && !image) setCameraOpen(true);
              }}
            />
          </View>
        )}


        <ScrollView
          ref={scroll}
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.body,
            inRoom && { paddingTop: 10, paddingHorizontal: 16 },
            // The Log button lies over the page's foot: the last row clears it.
            rides && footer ? { paddingBottom: footerHeight + 16 } : null,
            // Tall enough that the search field can always be brought to the top.
            rides && mode === 'search' && viewport > 0 ? { minHeight: viewport + searchTop - SEARCH_TOP_GAP } : null,
          ]}
          automaticallyAdjustKeyboardInsets={rides}
          onLayout={rides ? (event) => setViewport(event.nativeEvent.layout.height) : undefined}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // As the box grows line by line, or Re-analyze's error appears under it.
          onContentSizeChange={() => {
            if (fixing) scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          {inRoom ? <RoomWindowSlot spacing={14} /> : null}
          {mode === 'camera' ? (
            <>
              {/* The camera itself is a page over this one (see MealCamera).
                  Here: the way back into it, or what it found. */}
              <MealCamera
                open={cameraOpen}
                onClose={closeCamera}
                onOpen={() => {
                  setError(null);
                  setCameraOpen(true);
                }}
                launcher={!(photoMode && image) && !selected}
                problem={cameraOpen ? error : null}
                mode={cam}
                onMode={setCam}
                canPhoto={canScanPhotos}
                onLockedPhoto={lockedPhoto}
                onBarcode={(data) => void onBarcode({ data })}
                found={scanned && selected !== null}
                busy={busy === 'searching'}
                onPhoto={(shot) => void onShot(shot)}
                onLibrary={() => void pickFromLibrary()}
                onProblem={setError}
              />
              {photoMode && image ? (
                inRoom ? (
                  // In the Kitchen's page the photo shrinks to a thumbnail in the
                  // corner, with Retake and Library beside it, so what was read
                  // (the macros, the notes) is what fills the page.
                  <View style={styles.thumbRow} testID="photo-box">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retake the photo"
                      onPress={retake}
                      disabled={busy !== null}
                      style={({ pressed }) => pressed && styles.cameraPressed}
                    >
                      <Image source={{ uri: image.uri }} style={styles.thumb} />
                      {busy === 'analyzing' ? (
                        <View style={[styles.readingOverlay, styles.thumbOverlay]}>
                          <ActivityIndicator color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                    <View style={styles.thumbSide}>
                      <View style={styles.thumbButtons}>
                        <PressableScale style={[styles.pickButton, styles.thumbButton]} onPress={retake}>
                          <Text style={styles.pickLabel} numberOfLines={1}>Retake</Text>
                        </PressableScale>
                        <PressableScale style={[styles.pickButton, styles.thumbButton]} onPress={() => void pickFromLibrary()}>
                          <Text style={styles.pickLabel} numberOfLines={1}>Library</Text>
                        </PressableScale>
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    <View testID="photo-box">
                      <Image source={{ uri: image.uri }} style={styles.preview} />
                      {/* Read over the photo itself, not in a line under it. */}
                      {busy === 'analyzing' ? (
                        <View style={styles.readingOverlay}>
                          <ActivityIndicator color="#fff" />
                          <Text style={styles.readingOverlayLabel}>{readingLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.pickRow}>
                      <PressableScale style={styles.pickButton} onPress={retake}>
                        <Text style={styles.pickLabel} numberOfLines={1}>Retake</Text>
                      </PressableScale>
                      <PressableScale style={styles.pickButton} onPress={() => void pickFromLibrary()}>
                        <Text style={styles.pickLabel} numberOfLines={1}>Library</Text>
                      </PressableScale>
                    </View>
                  </>
                )
              ) : null}

              {photoMode ? (
                <>
                  {/* In the Kitchen these live on the Search tab, the room's first; the camera is just the camera. */}
                  {!image && !analysis && !inRoom ? copyRow : null}
                  {!image && !analysis && !inRoom ? <RecentMeals meals={forSlot(repeatable, slot)} again={again} onChange={setAgain} /> : null}

                  {analysis ? <AnalysisCard analysis={analysis} compact={inRoom} /> : null}
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
                </>
              ) : null}

              {scanMode ? (
                <>
                  {/* How many: a scanned bar is one bar, but two is two. */}
                  {selectedAnalysis ? <ServingsRow food={selected} servings={servings} onChange={setServings} /> : null}
                  {selectedAnalysis ? <AnalysisCard analysis={selectedAnalysis} /> : null}
                  {selected?.source === 'fatsecret' ? <FatSecretCredit /> : null}
                </>
              ) : null}
              <ErrorText>{error}</ErrorText>

              {scanMode && scanned ? (
                <View style={styles.actions}>
                  <TextButton
                    label="Scan another"
                    onPress={() => {
                      setScanned(false);
                      setSelected(null);
                      setCameraOpen(true);
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}

          {mode === 'search' ? (
            <>
              <View style={styles.searchRow} onLayout={rides ? (event) => setSearchTop(event.nativeEvent.layout.y) : undefined}>
                <TextInput
                  ref={searchInput}
                  // Typing: the field goes to the top of the page, the window
                  // scrolled away above it, and the results have the room.
                  onFocus={rides ? () => scroll.current?.scrollTo({ y: Math.max(0, searchTop - SEARCH_TOP_GAP), animated: true }) : undefined}
                  style={[layout.input, styles.searchInput]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={plate.length > 0 ? 'Add another food' : 'Search foods'}
                  placeholderTextColor={colors.faint}
                  accessibilityLabel="Search foods"
                  returnKeyType="search"
                  onSubmitEditing={() => void runSearch()}
                  // Opened from the Kitchen's Search button: straight to typing.
                  autoFocus={initialMode === 'search'}
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

              {/* The plate after the results: what is being searched for stays right
                  under the field, and the plate collects under it, food by food. */}
              {plateCard}


              {/* The way out for food no database has, under the list rather than
                  between the field and the results, where it read as the next step. */}
              {!quick ? (
                <View style={styles.quickOpen}>
                  <Text style={styles.quickPrompt}>Can't find it?</Text>
                  <TextButton label="Quick add calories" onPress={() => setQuick({ name: query.trim() })} />
                </View>
              ) : null}

              <ErrorText>{error}</ErrorText>
            </>
          ) : null}

          {mode === 'describe' ? (
            <>
              <View style={styles.describeBox} testID="describe-meal">
                <TextInput
                  style={[layout.input, styles.describeInput]}
                  value={describeText}
                  onChangeText={setDescribeText}
                  placeholder={plate.length > 0 ? 'Anything else? e.g. and a latte' : 'e.g. 2 eggs, toast with butter and a latte'}
                  placeholderTextColor={colors.faint}
                  multiline
                  maxLength={MAX_MEAL_TEXT_LENGTH}
                  editable={busy !== 'describing'}
                  // Opened from the Kitchen's Describe button: straight to typing.
                  autoFocus={initialMode === 'describe' && !canDictate()}
                  accessibilityLabel="Describe your meal"
                />
                <View style={styles.describeRow}>
                  {canDictate() ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={dictation.listening ? 'Stop listening' : 'Say what you ate'}
                      accessibilityState={{ selected: dictation.listening }}
                      disabled={busy !== null}
                      onPress={toggleMic}
                      hitSlop={6}
                      style={({ pressed }) => [styles.mic, dictation.listening && styles.micOn, pressed && styles.cameraPressed]}
                      testID="describe-mic"
                    >
                      <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
                        <Path
                          d="M12 3.5 a3 3 0 0 0 -3 3 v4.5 a3 3 0 0 0 6 0 V6.5 a3 3 0 0 0 -3 -3 Z M6 11 a6 6 0 0 0 12 0 M12 17 V20.5 M9 20.5 H15"
                          stroke={dictation.listening ? colors.onCoral : colors.coral}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    </Pressable>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      label={busy === 'describing' ? 'Finding your foods...' : 'Find foods'}
                      busy={busy === 'describing'}
                      disabled={!describeText.trim() || busy !== null}
                      onPress={() => void describe()}
                    />
                  </View>
                </View>
                <Text style={styles.describeHint}>
                  {dictation.listening
                    ? dictation.ready
                      ? 'Listening... tap the mic when you are done.'
                      : 'One sec...'
                    : (dictation.problem ?? describeNote ?? 'Say it or type it. You check the foods before anything is logged.')}
                </Text>
              </View>

              {plateCard}
              {plate.some(({ food }) => food.source === 'fatsecret') ? <FatSecretCredit /> : null}
              <ErrorText>{error}</ErrorText>
            </>
          ) : null}
        </ScrollView>
        {footer ? (
          <Animated.View
            style={[styles.footer, inRoom && styles.footerInRoom, rides && styles.footerRides, rides && { transform: [{ translateY: lift }] }]}
            onLayout={rides ? (event) => setFooterHeight(event.nativeEvent.layout.height) : undefined}
            testID="meal-footer"
          >
            {/* In the Kitchen the plate card says what it adds up to: the button stands alone. */}
            {footer.summary && !inRoom ? (
              <View style={styles.footerSummaryRow}>
                {pending ? <GradeBadge grade={pending.grade} size={22} /> : null}
                <Text style={styles.footerSummary} numberOfLines={1}>{footer.summary}</Text>
              </View>
            ) : null}
            <PrimaryButton label={footer.label} busy={footer.busy} disabled={footer.disabled} onPress={footer.onPress} />
          </Animated.View>
        ) : null}
      </View>
    </SheetPage>
  );
}

/**
 * The footer's one line about the meal: the numbers that matter most. Its
 * grade is the badge beside it; spelled out too, the line ran past a 320pt
 * phone and ended in "…".
 */
const summaryOf = (meal: MealAnalysis): string =>
  `${calorieEstimate(meal.macros).toLocaleString()} kcal · ${meal.macros.proteinGrams}g protein`;

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
// Grams whenever the food can be weighed, so "100 g of rice" is what is typed;
// servings only for a food with no weight to go by.
const defaultUnit = (food: FoodSearchResult): PortionUnit => (servingGrams(food) !== undefined ? 'g' : 'serving');
/**
 * What a food goes on the plate as: 100 g of anything that can be weighed (a
 * plate is weighed in round amounts: "100 g of steak", not the database's
 * 1 oz serving of it, which came out as 28 g), else one serving.
 */
const startingServings = (food: FoodSearchResult): number => {
  const grams = servingGrams(food);
  return grams ? 100 / grams : 1;
};

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
  // What is in the field while it is being typed in, blank included: bound
  // straight to the amount, deleting the last digit snapped it back, so "2"
  // could never become "25". Leaving the field goes back to the amount (so a
  // blank or 0 left behind changes nothing).
  const [draft, setDraft] = useState<number | undefined | null>(null);
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
          {/* No database had it (a described meal): the figures are a guess, and say so. */}
          {food.source === 'estimate' ? <Text style={styles.estimateTag} numberOfLines={1}>Estimate: not in the food database</Text> : null}
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
          onPress={() => {
            setDraft(null);
            set(Math.max(step, Math.round((amount - step) * 10) / 10));
          }}
          style={[styles.stepButton, atLeast && styles.stepButtonOff]}
        >
          <Mark kind="minus" size={10} color={colors.inkSoft} />
        </Pressable>
        <NumberInput
          decimal={unit !== 'g'}
          style={[layout.input, styles.amountInput]}
          value={draft === null ? amount : draft}
          onValue={(value) => {
            setDraft(value);
            if (value !== undefined) set(value);
          }}
          onBlur={() => setDraft(null)}
          accessibilityLabel={`Amount of ${food.name} in ${UNIT_LABEL[unit]}`}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More ${food.name}`}
          hitSlop={6}
          onPress={() => {
            setDraft(null);
            set(Math.round((amount + step) * 10) / 10);
          }}
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
              onPress={() => {
                setDraft(null);
                onUnit(option);
              }}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.unitChip, unit === option && styles.unitChipOn]}
            >
              <Text style={[styles.unitLabel, unit === option && styles.unitLabelOn]} numberOfLines={1}>{UNIT_LABEL[option]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Between the top of the page and the search field once it has been brought up to type in. */
const SEARCH_TOP_GAP = 8;

/** Live search waits for this many letters and this long a pause in typing. */
const LIVE_SEARCH_MIN = 2;
const LIVE_SEARCH_PAUSE_MS = 200;

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
      <Text style={styles.stepValue} numberOfLines={1}>{`${value}×`}</Text>
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
      <Text style={styles.servingsLabel} numberOfLines={2}>Servings{food ? ` · ${food.servingDescription}` : ''}</Text>
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

/**
 * The plate's name in a few words: its first foods, and how many more. The
 * AI's description is a paragraph ("15 raw oysters on the half shell (~15g
 * meat each), 2 small cups of..."), which is detail, not a name.
 */
const shortPlateName = (analysis: MealAnalysis): string => {
  const foods = analysis.detectedFoods.filter(Boolean);
  if (foods.length === 0) return analysis.summary?.trim() || analysis.foodDescription?.trim() || 'Meal detected';
  const shown = foods.slice(0, 2).join(', ');
  return foods.length > 2 ? `${shown} +${foods.length - 2} more` : shown;
};

function AnalysisCard({ analysis, compact }: { analysis: MealAnalysis; compact?: boolean }) {
  // What this plate will do, shown before it is logged — the same read the
  // toast and the pet will give afterwards, so nothing about it is a surprise.
  const effects = detectFoodEffects({ ...analysis.nutrients, analysis });
  const [details, setDetails] = useState(false);
  if (compact) {
    // The Kitchen's page: everything worth knowing in a short card, so the
    // page barely scrolls. The grade beside a short name, the four macros as
    // tiles, the rest of the nutrition on one line, and the AI's full
    // description a tap away.
    const description = analysis.foodDescription?.trim();
    const sub = describeSubMacros(analysis.macros);
    return (
      <View style={styles.compactCard}>
        <View style={styles.compactHead}>
          <GradeBadge grade={analysis.grade} size={40} />
          <Text style={styles.compactName} numberOfLines={2}>{shortPlateName(analysis)}</Text>
        </View>
        <View style={styles.compactMacros}>
          {[
            [String(calorieEstimate(analysis.macros)), 'kcal'],
            [`${analysis.macros.proteinGrams}g`, 'protein'],
            [`${analysis.macros.carbsGrams}g`, 'carbs'],
            [`${analysis.macros.fatGrams}g`, 'fat'],
          ].map(([value, label]) => (
            <View key={label} style={styles.compactTile}>
              <Text style={styles.compactValue} numberOfLines={1}>{value}</Text>
              <Text style={styles.compactUnit}>{label}</Text>
            </View>
          ))}
        </View>
        {sub ? <Text style={styles.compactSub} numberOfLines={1}>{sub}</Text> : null}
        {effects.length > 0 ? (
          <View style={[styles.effectRow, { marginTop: 0 }]} accessibilityLabel={`Effects: ${effects.map((e) => e.label).join(', ')}`}>
            {effects.map((effect) => (
              <View key={effect.id} style={styles.effectChip}>
                <Text style={styles.effectChipLabel}>{effect.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {description ? (
          <>
            {details ? <Text style={styles.compactDetails}>{description}</Text> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetails((open) => !open)}
              hitSlop={8}
              style={styles.compactToggle}
            >
              <Text style={styles.compactToggleLabel}>{details ? 'Hide details' : 'Show details'}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }
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
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 22,
  },
  title: { ...text.title, marginTop: 6 },
  tabs: { paddingHorizontal: 22, marginTop: 14, paddingBottom: 4 },
  body: { padding: 22, paddingBottom: 24 },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 92, height: 92, borderRadius: 16, backgroundColor: colors.sage },
  // Over the whole thumbnail, not the strip along a big photo's foot.
  thumbOverlay: { top: 0, paddingVertical: 0, borderRadius: 16 },
  thumbSide: { flex: 1, minWidth: 0, gap: 8 },
  thumbButtons: { flexDirection: 'row', gap: 8 },
  thumbButton: { flex: 1, marginTop: 0 },
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
  cameraPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  fixBox: { gap: 8, marginTop: 4 },
  fixLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.ink },
  fixInput: { minHeight: 64, textAlignVertical: 'top' },
  fixHint: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, color: colors.faint },
  fixActions: { gap: 6 },
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
  compactCard: { marginTop: 12, padding: 14, gap: 10, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.card },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactName: { flex: 1, fontFamily: fonts.ui, fontWeight: '700', fontSize: 17, lineHeight: 22, color: colors.ink },
  compactMacros: { flexDirection: 'row', gap: 6 },
  compactTile: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: colors.cardSoft },
  compactValue: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] },
  compactUnit: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted, marginTop: 1 },
  compactSub: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  compactDetails: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  compactToggle: { alignSelf: 'flex-start' },
  compactToggleLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: colors.coralDeep },
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
  quickOpen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14 },
  quickPrompt: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted },
  plateItem: { gap: 10, paddingVertical: 4 },
  plateItemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The unit chips drop under the amount when a phone is too narrow for both
  // (below ~390pt "servings" ran off the card's edge).
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  amountInput: { width: 72, minHeight: 40, paddingVertical: 8, textAlign: 'center', fontSize: 16 },
  amountUnits: { flexGrow: 1, flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', gap: 2 },
  unitChip: { minHeight: 30, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  unitChipOn: { backgroundColor: colors.selectedFill },
  unitLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  unitLabelOn: { color: colors.coralDeep, fontWeight: '700' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  copyPressed: { backgroundColor: colors.selectedFill },
  copyTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  copyMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
  scrollArea: { flex: 1, overflow: 'hidden' },
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
  searchButtonLabel: { color: '#fff', fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' },
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
  plateHead: { gap: 2 },
  plateTotal: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  keepBox: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  keepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  keepTick: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  keepTickOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  keepLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  keepName: { height: 42, paddingVertical: 0 },
  plateTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  plateName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardSoft, alignItems: 'center', justifyContent: 'center' },
  stepButtonOff: { opacity: 0.35 },
  stepRemove: { width: 30, height: 30, marginLeft: 6, alignItems: 'center', justifyContent: 'center' },
  stepMark: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.inkSoft, lineHeight: 15 },
  stepValue: { fontFamily: fonts.ui, fontSize: 13, color: colors.ink, minWidth: 34, flexShrink: 0, textAlign: 'center' },
  recent: { marginTop: 18, gap: 2 },
  recentTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, paddingHorizontal: 8 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8, borderRadius: 14, borderCurve: 'continuous' },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 8 },
  recentPlus: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral, lineHeight: 20 },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.paper },
  // The Kitchen's pinned bar is right under it: no home-indicator gap, less air.
  footerInRoom: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  // Over the page's foot rather than under it, so it can ride up on the keyboard.
  footerRides: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footerSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  footerSummary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft, textAlign: 'center', flexShrink: 1 },
  resultName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  resultMeta: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 3 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  // Takes what the field leaves: a long serving ("1 cup, chopped (128 g)") pushed the field off the card.
  // A food's serving can be long ("1 cup shredded or chopped (55 g)"): it gives way to the field.
  servingsLabel: { flex: 1, minWidth: 0, fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  servingsInput: { width: 90 },
  describeBox: { gap: 10, marginBottom: 10 },
  describeInput: { minHeight: 76, textAlignVertical: 'top' },
  describeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The mic: a round button beside Find foods, filled in while it listens.
  mic: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralWash },
  micOn: { backgroundColor: colors.coral },
  describeHint: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, color: colors.faint, textAlign: 'center' },
  estimateTag: { fontFamily: fonts.ui, fontSize: 12, color: colors.yellowDeep, marginTop: 3 },
}));
