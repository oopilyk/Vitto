import { useState } from 'react';
import {
  FOCUS_AREAS,
  calculateMacroTargets,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  parseNumberInput,
  weightGoalProgress,
  type BodyProfile,
  type FocusArea,
} from '../domain/macroTargets';

interface OnboardingProps {
  name: string;
  onNameChange: (value: string) => void;
  profile: BodyProfile;
  onUpdate: <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => void;
  onAdopt: () => Promise<void> | void;
  error: string | null;
  onSignOut?: () => void;
}

const STEPS = ['About you', 'Your goal', 'Your rhythm', 'What you want'];

const GOAL_LABEL: Record<BodyProfile['goal'], string> = {
  lose: 'Lose fat',
  maintain: 'Maintain',
  gain: 'Build muscle',
};

const PACE_COPY: Record<BodyProfile['goalPace'], { label: string; detail: string }> = {
  gentle: { label: 'Gentle', detail: 'Slow and sustainable' },
  steady: { label: 'Steady', detail: 'A clear, workable change' },
  focused: { label: 'Focused', detail: 'Faster, and harder to hold' },
};

const STYLE_COPY: Record<BodyProfile['trainingStyle'], { label: string; detail: string }> = {
  strength: { label: 'Strength', detail: 'Lifting, resistance work' },
  cardio: { label: 'Cardio', detail: 'Running, cycling, swimming' },
  mixed: { label: 'A bit of both', detail: 'Mixed training week' },
};

const FOCUS_COPY: Record<FocusArea, { label: string; detail: string }> = {
  nutrition: { label: 'Eat better', detail: 'Meals, macros, and daily fuel' },
  training: { label: 'Get stronger', detail: 'Workouts and progress over time' },
  movement: { label: 'Move more', detail: 'Steps and everyday activity' },
  mind: { label: 'Sharpen my mind', detail: 'Focus sessions and reading' },
};

export function Onboarding({ name, onNameChange, profile, onUpdate, onAdopt, error, onSignOut }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const displayedWeight = profile.weightUnit === 'lb'
    ? Math.round(convertWeightValue(profile.weightKg, 'kg', 'lb') * 10) / 10
    : profile.weightKg;
  const displayedHeight = profile.heightUnit === 'ft'
    ? convertHeightToFeetAndInches(profile.heightCm)
    : { feet: 0, inches: profile.heightCm };
  const displayedTarget = profile.targetWeightKg
    ? profile.weightUnit === 'lb'
      ? Math.round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb') * 10) / 10
      : Math.round(profile.targetWeightKg * 10) / 10
    : '';

  const toWeightKg = (value: string) =>
    profile.weightUnit === 'lb' ? parseNumberInput(value) / 2.20462 : parseNumberInput(value);

  const targets = calculateMacroTargets(profile);
  const goalProgress = weightGoalProgress(profile);

  const validateStep = (): string | null => {
    if (step === 0) {
      if (profile.age < 13 || profile.age > 100) return 'Age must be between 13 and 100.';
      if (profile.heightCm < 120 || profile.heightCm > 230) return 'Height must be between 120 and 230 cm.';
      if (profile.weightKg < 30 || profile.weightKg > 300) return 'Weight must be between 30 and 300 kg.';
    }
    if (step === 1 && profile.targetWeightKg && (profile.targetWeightKg < 30 || profile.targetWeightKg > 300)) {
      return 'Target weight must be between 30 and 300 kg.';
    }
    if (step === 3 && profile.focusAreas.length === 0) {
      return 'Pick at least one thing you want from Vitto.';
    }
    return null;
  };

  const advance = () => {
    const failure = validateStep();
    setStepError(failure);
    if (failure) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void onAdopt();
  };

  const toggleFocus = (area: FocusArea) => {
    const selected = profile.focusAreas.includes(area);
    onUpdate(
      'focusAreas',
      selected ? profile.focusAreas.filter((item) => item !== area) : [...profile.focusAreas, area],
    );
  };

  return (
    <main className="welcome">
      <div className="welcome-copy">
        <div className="welcome-top">
          <p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p>
          {onSignOut && (
            <button className="text-button" type="button" onClick={onSignOut}>
              Log out
            </button>
          )}
        </div>

        <div className="wizard-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, index) => (
            <span key={label} className={index <= step ? 'wizard-dot wizard-dot-done' : 'wizard-dot'} />
          ))}
          <small>{STEPS[step]}</small>
        </div>

        {step === 0 && (
          <>
            <h1>Raise a pet<br /><em>by living well.</em></h1>
            <p className="intro">
              Set a few basics so your companion can learn what fuel supports your goals.
            </p>
            <label>
              What will you call them?
              <input value={name} onChange={(event) => onNameChange(event.target.value)} maxLength={18} />
            </label>
            <div className="profile-grid">
              <label>
                Age
                <input
                  type="number"
                  min="13"
                  max="100"
                  value={profile.age}
                  onChange={(event) => onUpdate('age', parseNumberInput(event.target.value))}
                />
              </label>
              <label>
                Weight ({profile.weightUnit})
                <input
                  type="number"
                  min={profile.weightUnit === 'lb' ? 66 : 30}
                  max={profile.weightUnit === 'lb' ? 661 : 300}
                  value={displayedWeight}
                  onChange={(event) => onUpdate('weightKg', toWeightKg(event.target.value))}
                />
              </label>
              <label>
                Unit
                <select
                  value={profile.weightUnit}
                  onChange={(event) => onUpdate('weightUnit', event.target.value as BodyProfile['weightUnit'])}
                >
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </label>
              <label>
                Height unit
                <select
                  value={profile.heightUnit}
                  onChange={(event) => onUpdate('heightUnit', event.target.value as BodyProfile['heightUnit'])}
                >
                  <option value="cm">Centimeters</option>
                  <option value="ft">Feet &amp; inches</option>
                </select>
              </label>
              {profile.heightUnit === 'cm' ? (
                <label>
                  Height (cm)
                  <input
                    type="number"
                    min="120"
                    max="230"
                    value={profile.heightCm}
                    onChange={(event) => onUpdate('heightCm', Number(event.target.value) || 0)}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Height (ft)
                    <input
                      type="number"
                      min="3"
                      max="8"
                      value={displayedHeight.feet}
                      onChange={(event) =>
                        onUpdate('heightCm', feetAndInchesToCm(Number(event.target.value) || 0, displayedHeight.inches))
                      }
                    />
                  </label>
                  <label>
                    Height (in)
                    <input
                      type="number"
                      min="0"
                      max="11"
                      value={displayedHeight.inches}
                      onChange={(event) =>
                        onUpdate('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(event.target.value) || 0))
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Sex
                <select
                  value={profile.sex}
                  onChange={(event) => onUpdate('sex', event.target.value as BodyProfile['sex'])}
                >
                  <option value="other">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>What are you<br /><em>working toward?</em></h1>
            <p className="intro">This sets how far your daily calories sit from maintenance.</p>
            <div className="wizard-choices">
              {(Object.keys(GOAL_LABEL) as BodyProfile['goal'][]).map((goal) => (
                <button
                  type="button"
                  key={goal}
                  className={profile.goal === goal ? 'wizard-choice wizard-chosen' : 'wizard-choice'}
                  onClick={() => onUpdate('goal', goal)}
                >
                  <b>{GOAL_LABEL[goal]}</b>
                </button>
              ))}
            </div>
            {profile.goal !== 'maintain' && (
              <>
                <label className="wizard-field">
                  Target weight ({profile.weightUnit}) <i>optional</i>
                  <input
                    type="number"
                    min={profile.weightUnit === 'lb' ? 66 : 30}
                    max={profile.weightUnit === 'lb' ? 661 : 300}
                    value={displayedTarget}
                    placeholder="Leave blank to skip"
                    onChange={(event) =>
                      onUpdate('targetWeightKg', event.target.value ? toWeightKg(event.target.value) : undefined)
                    }
                  />
                </label>
                {goalProgress && !goalProgress.matchesGoal && (
                  <p className="wizard-note">
                    That target means {goalProgress.direction === 'lose' ? 'losing' : 'gaining'} weight, which
                    does not match “{GOAL_LABEL[profile.goal]}”. You can keep both — just checking.
                  </p>
                )}
                <p className="wizard-label">How hard do you want to push?</p>
                <div className="wizard-choices">
                  {(Object.keys(PACE_COPY) as BodyProfile['goalPace'][]).map((pace) => (
                    <button
                      type="button"
                      key={pace}
                      className={profile.goalPace === pace ? 'wizard-choice wizard-chosen' : 'wizard-choice'}
                      onClick={() => onUpdate('goalPace', pace)}
                    >
                      <b>{PACE_COPY[pace].label}</b>
                      <small>{PACE_COPY[pace].detail}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h1>How does your<br /><em>week actually go?</em></h1>
            <p className="intro">Training days lift your calorie needs, and lifting raises your protein target.</p>
            <div className="profile-grid">
              <label>
                Everyday activity
                <select
                  value={profile.activity}
                  onChange={(event) => onUpdate('activity', event.target.value as BodyProfile['activity'])}
                >
                  <option value="low">Mostly sitting</option>
                  <option value="moderate">On my feet some</option>
                  <option value="high">On my feet all day</option>
                </select>
              </label>
              <label>
                Training days per week
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={profile.trainingDaysPerWeek}
                  onChange={(event) =>
                    onUpdate('trainingDaysPerWeek', Math.max(0, Math.min(7, parseNumberInput(event.target.value))))
                  }
                />
              </label>
            </div>
            <p className="wizard-label">What does that training look like?</p>
            <div className="wizard-choices">
              {(Object.keys(STYLE_COPY) as BodyProfile['trainingStyle'][]).map((style) => (
                <button
                  type="button"
                  key={style}
                  className={profile.trainingStyle === style ? 'wizard-choice wizard-chosen' : 'wizard-choice'}
                  onClick={() => onUpdate('trainingStyle', style)}
                >
                  <b>{STYLE_COPY[style].label}</b>
                  <small>{STYLE_COPY[style].detail}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>What do you want<br /><em>from Vitto?</em></h1>
            <p className="intro">Pick as many as you like — your dashboard leads with these.</p>
            <div className="wizard-choices wizard-choices-stacked">
              {FOCUS_AREAS.map((area) => (
                <button
                  type="button"
                  key={area}
                  className={profile.focusAreas.includes(area) ? 'wizard-choice wizard-chosen' : 'wizard-choice'}
                  onClick={() => toggleFocus(area)}
                  aria-pressed={profile.focusAreas.includes(area)}
                >
                  <b>{FOCUS_COPY[area].label}</b>
                  <small>{FOCUS_COPY[area].detail}</small>
                </button>
              ))}
            </div>
            <div className="wizard-summary">
              <p className="kicker">YOUR DAILY FUEL</p>
              <p>
                <b>{targets.calories.toLocaleString()}</b> kcal · <b>{targets.proteinGrams}g</b> protein ·{' '}
                <b>{targets.carbsGrams}g</b> carbs · <b>{targets.fatGrams}g</b> fat
              </p>
              {goalProgress && goalProgress.direction !== 'maintain' && (
                <small>
                  {goalProgress.remainingKg} kg to {goalProgress.direction === 'lose' ? 'lose' : 'gain'} · a{' '}
                  {PACE_COPY[profile.goalPace].label.toLowerCase()} pace
                </small>
              )}
            </div>
          </>
        )}

        <div className="wizard-actions">
          <button className="primary" onClick={advance}>
            {step === STEPS.length - 1 ? `Adopt ${name || 'your pet'}` : 'Continue'} <span>→</span>
          </button>
          {step > 0 && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setStepError(null);
                setStep(step - 1);
              }}
            >
              Back
            </button>
          )}
        </div>
        {(stepError || error) && <p className="form-error">{stepError ?? error}</p>}
      </div>
      <div className="welcome-pet" aria-label="A sleepy orange pet">
        <div className="pet-face large">◡</div>
        <div className="spark spark-one">✦</div>
        <div className="spark spark-two">✧</div>
      </div>
    </main>
  );
}
