import { useState } from 'react';
import type { MealAnalysis, MealMetadata } from '../domain/health';
import { searchFoodsByName, toMealAnalysis, type FoodSearchResult } from '../services/foodDatabase';
import { errorMessage } from '../services/errorMessage';

interface ManualFoodEntryProps {
  onComplete: (metadata: MealMetadata) => Promise<void>;
  onFeedStart: (imageUrl: string | null, grade: MealAnalysis['grade']) => void;
  onAnalyzingChange: (isAnalyzing: boolean) => void;
  onClose: () => void;
}

const DEFAULT_SERVINGS = 1;

export function ManualFoodEntry({ onComplete, onFeedStart, onAnalyzingChange, onClose }: ManualFoodEntryProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    onAnalyzingChange(true);
    setError(null);
    setSelected(null);
    try {
      const found = await searchFoodsByName(query);
      setResults(found);
      if (found.length === 0) setError('No foods matched that search.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Food search failed.');
    } finally {
      setIsSearching(false);
      onAnalyzingChange(false);
    }
  };

  const addToCareLog = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    try {
      const analysis = toMealAnalysis(selected, servings);
      await onComplete({ ...analysis.nutrients, analysis, loggedVia: 'manual' });
      onFeedStart(null, analysis.grade);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this meal.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <form className="food-search-form" onSubmit={runSearch}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for a food, e.g. grilled chicken breast"
        />
        <button className="primary" type="submit" disabled={isSearching || !query.trim()}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {!selected && results.length > 0 && (
        <ul className="food-results">
          {results.map((food) => (
            <li key={food.id}>
              <button type="button" onClick={() => setSelected(food)}>
                <span>
                  <b>{food.name}</b>
                  {food.brand && <small> · {food.brand}</small>}
                </span>
                <small>{food.macros.calories} kcal · {food.servingDescription}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="analysis-result">
          <div>
            <h3>{selected.name}</h3>
            <p>{selected.servingDescription}</p>
            <label className="servings-field">
              Servings
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={servings}
                onChange={(event) => setServings(Number(event.target.value) || DEFAULT_SERVINGS)}
              />
            </label>
            <div className="macro-line">
              <b>{Math.round(selected.macros.proteinGrams * servings)}g</b> protein{' '}
              <b>{Math.round(selected.macros.carbsGrams * servings)}g</b> carbs{' '}
              <b>{Math.round(selected.macros.fatGrams * servings)}g</b> fat{' '}
              <b>{Math.round(selected.macros.calories * servings)}</b> kcal
            </div>
          </div>
        </div>
      )}
      {saved && <p className="auth-message">Meal added to your care log.</p>}
      <div className="meal-actions">
        {selected ? (
          <button className="primary" disabled={isSaving} onClick={addToCareLog}>
            {isSaving ? 'Saving meal...' : 'Add to care log'} <span>→</span>
          </button>
        ) : null}
        <button className="text-button" disabled={isSaving} onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}
