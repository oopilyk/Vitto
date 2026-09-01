import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { type FoodSearchResult, type MealAnalysis, type MealMetadata, calorieEstimate, errorMessage, lookupBarcode, searchFoodsByName, toMealAnalysis } from '@vitto/core';
import { analyzeMealImage, type PickedImage } from '../services/mealAnalysis';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (analyzing: boolean) => void;
  onClose: () => void;
}

type Mode = 'photo' | 'search' | 'scan';

export function MealCaptureScreen({ onComplete, onFeedStart, onAnalyzingChange, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('photo');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [busy, setBusy] = useState<'analyzing' | 'saving' | 'searching' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [servings, setServings] = useState('1');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const reset = () => {
    setAnalysis(null);
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
    const picked =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ['images'] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    setImage({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? undefined });
  };

  const analyze = async () => {
    if (!image) return;
    setBusy('analyzing');
    onAnalyzingChange(true);
    setError(null);
    try {
      setAnalysis(await analyzeMealImage(image));
    } catch (cause) {
      setError(errorMessage(cause, 'Meal analysis failed.'));
    } finally {
      setBusy(null);
      onAnalyzingChange(false);
    }
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setBusy('searching');
    setError(null);
    setSelected(null);
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

  const selectedAnalysis = selected
    ? toMealAnalysis(selected, Math.max(0.1, Number(servings) || 1))
    : null;

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
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
                setScanned(false);
              }}
              style={[styles.tab, mode === option && styles.tabOn]}
            >
              <Text style={[styles.tabLabel, mode === option && styles.tabLabelOn]}>
                {option === 'photo' ? 'Photo' : option === 'search' ? 'Search' : 'Scan barcode'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {mode === 'photo' ? (
            <>
              {image ? (
                <Image source={{ uri: image.uri }} style={styles.preview} />
              ) : (
                <View style={styles.dropzone}>
                  <Text style={styles.dropTitle}>Add a photo of your meal</Text>
                  <Text style={styles.dropHint}>Vitto reads the plate and grades it</Text>
                </View>
              )}
              <View style={styles.pickRow}>
                <Pressable style={styles.pickButton} onPress={() => pick('camera')}>
                  <Text style={styles.pickLabel}>Take photo</Text>
                </Pressable>
                <Pressable style={styles.pickButton} onPress={() => pick('library')}>
                  <Text style={styles.pickLabel}>Choose from library</Text>
                </Pressable>
              </View>

              {analysis ? <AnalysisCard analysis={analysis} /> : null}
              <ErrorText>{error}</ErrorText>

              <View style={styles.actions}>
                {analysis ? (
                  <PrimaryButton
                    label={busy === 'saving' ? 'Saving...' : 'Add to care log'}
                    busy={busy === 'saving'}
                    onPress={() => void saveAnalysis(analysis, 'ai')}
                  />
                ) : (
                  <PrimaryButton
                    label={busy === 'analyzing' ? 'Reading your plate...' : 'Analyze meal'}
                    disabled={!image}
                    busy={busy === 'analyzing'}
                    onPress={() => void analyze()}
                  />
                )}
                <TextButton label="Cancel" onPress={onClose} />
              </View>
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

              {results.map((food) => (
                <Pressable
                  key={food.id}
                  style={[styles.result, selected?.id === food.id && styles.resultOn]}
                  onPress={() => setSelected(food)}
                >
                  <Text style={styles.resultName}>{food.name}</Text>
                  <Text style={styles.resultMeta}>
                    {food.macros.calories} kcal · {food.servingDescription}
                  </Text>
                </Pressable>
              ))}

              {selectedAnalysis ? (
                <>
                  <View style={styles.servingsRow}>
                    <Text style={styles.servingsLabel}>Servings</Text>
                    <TextInput
                      style={[layout.input, styles.servingsInput]}
                      keyboardType="decimal-pad"
                      value={servings}
                      onChangeText={setServings}
                    />
                  </View>
                  <AnalysisCard analysis={selectedAnalysis} />
                </>
              ) : null}
              <ErrorText>{error}</ErrorText>

              <View style={styles.actions}>
                <PrimaryButton
                  label={busy === 'saving' ? 'Saving...' : 'Add to care log'}
                  disabled={!selectedAnalysis}
                  busy={busy === 'saving'}
                  onPress={() => selectedAnalysis && void saveAnalysis(selectedAnalysis, 'manual')}
                />
                <TextButton label="Cancel" onPress={onClose} />
              </View>
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

              {selectedAnalysis ? <AnalysisCard analysis={selectedAnalysis} /> : null}
              <ErrorText>{error}</ErrorText>

              <View style={styles.actions}>
                <PrimaryButton
                  label={busy === 'saving' ? 'Saving...' : 'Add to care log'}
                  disabled={!selectedAnalysis}
                  busy={busy === 'saving'}
                  onPress={() => selectedAnalysis && void saveAnalysis(selectedAnalysis, 'barcode')}
                />
                <TextButton
                  label={scanned ? 'Scan another' : 'Cancel'}
                  onPress={() => {
                    if (!scanned) return onClose();
                    setScanned(false);
                    setSelected(null);
                  }}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function AnalysisCard({ analysis }: { analysis: MealAnalysis }) {
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  closeMark: { fontSize: 24, color: colors.muted, lineHeight: 28 },
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
  tabLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.faint },
  tabLabelOn: { color: colors.ink },
  body: { padding: 22, paddingBottom: 60 },
  preview: { width: '100%', height: 230, borderRadius: 16, backgroundColor: colors.sage },
  dropzone: {
    height: 190,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#b9c4b7',
    backgroundColor: '#eef2ec',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  dropHint: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
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
  pickLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
  analysis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
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
  gradeLetter: { fontFamily: fonts.display, fontSize: 30, color: '#fff' },
  gradeLabel: { fontFamily: fonts.mono, fontSize: 7, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6 },
  analysisBody: { flex: 1 },
  analysisName: { fontSize: 15, fontWeight: '600', color: colors.ink, lineHeight: 20 },
  macroLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  macro: { flexDirection: 'row', alignItems: 'baseline' },
  macroValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  macroUnit: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  actions: { marginTop: 24, gap: 16, alignItems: 'stretch' },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1 },
  searchButton: {
    backgroundColor: colors.coral,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  searchButtonLabel: { color: '#fff', fontFamily: fonts.mono, fontSize: 12 },
  result: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#e8e5de' },
  resultOn: { backgroundColor: '#fbf1ee' },
  resultName: { fontSize: 14, color: colors.ink },
  resultMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  servingsLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  servingsInput: { width: 90 },
  scanner: { height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  scanHint: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, marginTop: 12, textAlign: 'center' },
});
