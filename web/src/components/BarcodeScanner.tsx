import { BrowserMultiFormatReader } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import { type FoodSearchResult, type MealAnalysis, type MealMetadata, calorieEstimate, errorMessage, lookupBarcode, toMealAnalysis } from '@vitto/core';

interface BarcodeScannerProps {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (isAnalyzing: boolean) => void;
  onClose: () => void;
}

const DEFAULT_SERVINGS = 1;

export function BarcodeScanner({ onComplete, onFeedStart, onAnalyzingChange, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [found, setFound] = useState<FoodSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    if (!isScanning) return undefined;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, async (result, decodeError) => {
        if (cancelled || !result) return;
        setIsScanning(false);
        onAnalyzingChange(true);
        setError(null);
        try {
          const product = await lookupBarcode(result.getText());
          if (!product) setError('That barcode was not found. Try search instead.');
          setFound(product);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Barcode lookup failed.');
        } finally {
          onAnalyzingChange(false);
        }
        void decodeError;
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not access the camera.');
        }
      });

    return () => {
      cancelled = true;
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, [isScanning, onAnalyzingChange]);

  const preview = found ? toMealAnalysis(found, DEFAULT_SERVINGS) : null;

  const addToCareLog = async () => {
    if (!found || !preview) return;
    setIsSaving(true);
    setError(null);
    try {
      const analysis = preview;
      await onComplete({ ...analysis.nutrients, analysis, loggedVia: 'barcode' });
      onFeedStart(null, analysis.grade);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this meal.'));
    } finally {
      setIsSaving(false);
    }
  };

  const scanAgain = () => {
    setFound(null);
    setError(null);
    setIsScanning(true);
  };

  return (
    <>
      {isScanning && (
        <div className="scanner-zone">
          <video ref={videoRef} muted playsInline />
          <small>Point the camera at a barcode.</small>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {found && preview && (
        <div className="analysis-result">
          <div>
            <h3>{found.name}</h3>
            <p>{[found.brand, found.servingDescription].filter(Boolean).join(' · ')}</p>
            <div className="macro-line">
              <b>{preview.macros.proteinGrams}g</b> protein <b>{preview.macros.carbsGrams}g</b> carbs{' '}
              <b>{preview.macros.fatGrams}g</b> fat <b>{calorieEstimate(preview.macros)}</b> kcal
            </div>
          </div>
        </div>
      )}
      {saved && <p className="auth-message">Meal added to your care log.</p>}
      <div className="meal-actions">
        {found ? (
          <button className="primary" disabled={isSaving} onClick={addToCareLog}>
            {isSaving ? 'Saving meal...' : 'Add to care log'} <span>→</span>
          </button>
        ) : null}
        {!isScanning && !isSaving && (
          <button className="text-button" onClick={scanAgain}>
            Scan again
          </button>
        )}
        <button className="text-button" disabled={isSaving} onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}
