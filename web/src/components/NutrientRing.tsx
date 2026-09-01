interface NutrientRingProps {
  value: number;
  label: string;
  color: string;
  percent: number;
  unit?: string;
  emphasis?: boolean;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function NutrientRing({ value, label, color, percent, unit = 'kcal', emphasis }: NutrientRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className={`nutrient-ring${emphasis ? ' ring-over' : ''}`}>
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r={RADIUS} />
        <circle
          className="ring-value"
          cx="50"
          cy="50"
          r={RADIUS}
          style={{
            stroke: color,
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="ring-center">
        <strong>{Math.round(Math.abs(value)).toLocaleString()}</strong>
        <small>{unit}</small>
      </div>
      <span className="ring-label">{label}</span>
    </div>
  );
}
