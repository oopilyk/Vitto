import { useState } from 'react';
import type { MealAnalysis, MealMetadata } from '../domain/health';
import { analyzeMealImage } from '../services/mealAnalysis';

interface MealCaptureProps {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onClose: () => void;
}

export function MealCapture({ onComplete, onClose }: MealCaptureProps) {
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
    setError(null);
    try {
      setAnalysis(await analyzeMealImage(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Meal analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addToCareLog = async () => {
    if (!analysis) return;
    setIsSaving(true);
    setError(null);
    try {
      await onComplete({ ...analysis.nutrients, analysis });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this meal.');
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="meal-modal" role="dialog" aria-modal="true" aria-labelledby="meal-title">
    <div className="meal-card">
      <div className="meal-card-heading"><div><p className="kicker">NOURISHMENT CHECK</p><h2 id="meal-title">What’s on your plate?</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
      <label className="upload-zone">
        {preview ? <img src={preview} alt="Selected meal" /> : <><strong>Choose a food photo</strong><small>JPG, PNG, or HEIC · 8 MB max</small></>}
        <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
      </label>
      {error && <p className="form-error">{error}</p>}
      {analysis && <div className="analysis-result"><div className="grade">{analysis.grade}<small>plate grade</small></div><div><h3>{analysis.summary}</h3><p>{analysis.detectedFoods.join(' · ') || 'Meal details detected'}</p><div className="macro-line"><b>{analysis.macros.proteinGrams}g</b> protein <b>{analysis.macros.carbsGrams}g</b> carbs <b>{analysis.macros.fatGrams}g</b> fat <b>{analysis.macros.calories}</b> kcal</div></div></div>}
      {saved && <p className="auth-message">Meal added to your care log.</p>}<div className="meal-actions">{!analysis ? <button className="primary" disabled={!file || isAnalyzing} onClick={analyze}>{isAnalyzing ? 'Reading your plate...' : 'Analyze meal'} <span>→</span></button> : <button className="primary" disabled={isSaving} onClick={addToCareLog}>{isSaving ? 'Saving meal...' : 'Add to care log'} <span>→</span></button>}<button className="text-button" disabled={isSaving} onClick={onClose}>Cancel</button></div>
    </div>
  </div>;
}