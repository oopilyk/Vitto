import { lazy, Suspense, useState } from 'react';
import type { MealAnalysis, MealMetadata } from '../domain/health';
import { calorieEstimate } from '../domain/macros';
import { analyzeMealImage } from '../services/mealAnalysis';
import { ManualFoodEntry } from './ManualFoodEntry';
import { errorMessage } from '../services/errorMessage';

const BarcodeScanner = lazy(() =>
  import('./BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })),
);

interface MealCaptureProps {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (isAnalyzing: boolean) => void;
  onClose: () => void;
}

type MealEntryMode = 'photo' | 'search' | 'scan';

export function MealCapture({ onComplete, onFeedStart, onAnalyzingChange, onClose }: MealCaptureProps) {
  const [mode, setMode] = useState<MealEntryMode>('photo');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const chooseFile = (nextFile: File | undefined) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('image/') || nextFile.size > 8 * 1024 * 1024) {
      setError('Choose an image smaller than 8 MB.');
      return;
    }
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setAnalysis(null);
    setError(null);
  };

  const analyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    onAnalyzingChange(true);
    setError(null);
    try {
      setAnalysis(await analyzeMealImage(file));
    } catch (cause) {
      setError(errorMessage(cause, 'Meal analysis failed.'));
    } finally {
      setIsAnalyzing(false);
      onAnalyzingChange(false);
    }
  };

  const addToCareLog = async () => {
    if (!analysis) return;
    setIsSaving(true);
    setError(null);
    try {
      await onComplete({ ...analysis.nutrients, analysis, loggedVia: 'ai' });
      if (preview) onFeedStart(preview, analysis.grade);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this meal.'));
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="meal-modal" role="dialog" aria-modal="true" aria-labelledby="meal-title">
    <div className="meal-card">
      <div className="meal-card-heading"><div><p className="kicker">NOURISHMENT CHECK</p><h2 id="meal-title">What’s on your plate?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="meal-mode-tabs">
        <button type="button" className={mode === 'photo' ? 'mode-active' : ''} onClick={() => setMode('photo')}>Photo</button>
        <button type="button" className={mode === 'search' ? 'mode-active' : ''} onClick={() => setMode('search')}>Search</button>
        <button type="button" className={mode === 'scan' ? 'mode-active' : ''} onClick={() => setMode('scan')}>Scan barcode</button>
      </div>
      {mode === 'photo' && (
        <>
          <label className="upload-zone">
            {preview ? <img src={preview} alt="Selected meal" /> : <><strong>Choose a food photo</strong><small>JPG, PNG, or HEIC · 8 MB max</small></>}
            <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
          </label>
          {error && <p className="form-error">{error}</p>}
          {analysis && (
            <div className="analysis-result">
              <div className="grade-wrap">
                <div className="grade"><b>{analysis.grade}</b><small>PLATE GRADE</small></div>
              </div>
              <div className="analysis-copy">
                <h3>{analysis.foodDescription || analysis.detectedFoods.join(', ') || 'Meal detected'}</h3>
                {analysis.foodDescription && <p className="analysis-secondary">{analysis.summary}</p>}
                <div className="macro-line">
                  <span><strong>{calorieEstimate(analysis.macros)}</strong> kcal</span>
                  <span><strong>{analysis.macros.proteinGrams}g</strong> protein</span>
                  <span><strong>{analysis.macros.carbsGrams}g</strong> carbs</span>
                  <span><strong>{analysis.macros.fatGrams}g</strong> fat</span>
                </div>
              </div>
            </div>
          )}
          {saved && <p className="auth-message">Meal added to your care log.</p>}
          <div className="meal-actions">
            {!analysis ? (
              <button className="primary" disabled={!file || isAnalyzing} onClick={analyze}>
                {isAnalyzing ? 'Reading your plate...' : 'Analyze meal'} <span>→</span>
              </button>
            ) : (
              <button className="primary" disabled={isSaving} onClick={addToCareLog}>
                {isSaving ? 'Saving meal...' : 'Add to care log'} <span>→</span>
              </button>
            )}
            <button className="text-button inline-cancel" disabled={isSaving} onClick={onClose}>Cancel</button>
          </div>
        </>
      )}
      {mode === 'search' && (
        <ManualFoodEntry onComplete={onComplete} onFeedStart={onFeedStart} onAnalyzingChange={onAnalyzingChange} onClose={onClose} />
      )}
      {mode === 'scan' && (
        <Suspense fallback={<p className="empty">Loading scanner...</p>}>
          <BarcodeScanner onComplete={onComplete} onFeedStart={onFeedStart} onAnalyzingChange={onAnalyzingChange} onClose={onClose} />
        </Suspense>
      )}
    </div>
  </div>;
}