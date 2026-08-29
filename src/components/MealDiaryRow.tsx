import { useState } from 'react';
import type { HealthEvent, MealMetadata } from '../domain/health';

interface MealDiaryRowProps {
  event: HealthEvent<MealMetadata>;
}

const LOGGED_VIA_ICON: Record<NonNullable<MealMetadata['loggedVia']>, string> = {
  ai: '✣',
  barcode: '▤',
  manual: '✎',
};

const LOGGED_VIA_LABEL: Record<NonNullable<MealMetadata['loggedVia']>, string> = {
  ai: 'AI photo',
  barcode: 'Barcode',
  manual: 'Manual',
};

export function MealDiaryRow({ event }: MealDiaryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const analysis = event.metadata.analysis;
  const loggedVia = event.metadata.loggedVia ?? 'ai';
  const isAiLogged = loggedVia === 'ai';
  const name = analysis?.foodDescription || analysis?.detectedFoods.join(', ') || analysis?.summary || 'Meal';
  const calories = analysis?.macros.calories ?? 0;
  const time = new Date(event.occurredAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className={`diary-row${expanded ? ' diary-row-expanded' : ''}`}>
      <button
        type="button"
        className="diary-row-summary"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="diary-row-icon">{LOGGED_VIA_ICON[loggedVia]}</span>
        <span className="diary-row-info">
          <b>{name}</b>
          <small>
            {time} · {LOGGED_VIA_LABEL[loggedVia]}
            {analysis ? ` · Grade ${analysis.grade}` : ''}
          </small>
        </span>
        <span className="diary-row-cal">{calories} kcal</span>
        <span className="diary-row-caret">{expanded ? '︿' : '﹀'}</span>
      </button>
      {expanded && analysis && (
        <div className="diary-row-detail">
          <div className="diary-macro-grid">
            <div>
              <b>{analysis.macros.calories}</b>
              <small>Calories</small>
            </div>
            <div>
              <b>{analysis.macros.proteinGrams}g</b>
              <small>Protein</small>
            </div>
            <div>
              <b>{analysis.macros.carbsGrams}g</b>
              <small>Carbs</small>
            </div>
            <div>
              <b>{analysis.macros.fatGrams}g</b>
              <small>Fat</small>
            </div>
          </div>
          {isAiLogged && analysis.summary && (
            <p className="diary-analysis">{analysis.summary}</p>
          )}
        </div>
      )}
    </div>
  );
}
