import { useState } from "react";
import type { HealthEvent, MealMetadata } from "../domain/health";
import {
  calculateMacroTargets,
  cmToFeetAndInches,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  parseNumberInput,
  type BodyProfile,
} from "../domain/macroTargets";
import {
  estimateCaloriesBurned,
  getEventsForDay,
  getMealsForDay,
  sumMealMacros,
} from "../domain/nutritionSummary";
import { calculateStreaks } from "../domain/streaks";
import { NutrientRing } from "./NutrientRing";
import { MealDiaryRow } from "./MealDiaryRow";
import { ActivityCalendar } from "./ActivityCalendar";

interface ProfilePageProps {
  profile: BodyProfile;
  events: HealthEvent[];
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
}

export function ProfilePage({
  profile: initialProfile,
  events,
  onSave,
  onClose,
}: ProfilePageProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [saved, setSaved] = useState(false);
  const targets = calculateMacroTargets(profile);
  const displayedWeight = profile.weightUnit === "lb"
    ? Math.round(convertWeightValue(profile.weightKg, "kg", "lb") * 10) / 10
    : profile.weightKg;
  const displayedHeight = profile.heightUnit === "ft"
    ? convertHeightToFeetAndInches(profile.heightCm)
    : { feet: 0, inches: profile.heightCm };
  const updateWeight = (value: string) => update("weightKg", profile.weightUnit === "lb" ? parseNumberInput(value) / 2.20462 : parseNumberInput(value));
  const updateHeightInFt = (feet: number, inches: number) => update("heightCm", feetAndInchesToCm(feet, inches));
  const changeWeightUnit = (nextUnit: BodyProfile["weightUnit"]) => update("weightUnit", nextUnit);
  const changeHeightUnit = (nextUnit: BodyProfile["heightUnit"]) => update("heightUnit", nextUnit);
  const meals = events.filter((event) => event.type === "MEAL").length;
  const workouts = events.filter((event) => event.type === "WORKOUT").length;
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const todaysMeals = getMealsForDay(events, today);
  const consumed = sumMealMacros(todaysMeals);
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateStreaks(events, today);
  const HISTORY_PAGE_SIZE = 20;
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) =>
    setProfile((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave(profile);
    setSaved(true);
  };

  return (
    <main className="profile-page">
      <header className="profile-header">
        <div>
          <p className="kicker">VITTO / YOUR PROFILE</p>
          <h1>
            Your progress,
            <br />
            <em>your pace.</em>
          </h1>
        </div>
        <button className="text-button" onClick={onClose}>
          Back to pet
        </button>
      </header>
      <section className="profile-layout">
        <div>
          <div className="profile-summary">
            <span className="profile-initial">V</span>
            <div>
              <h2>Health profile</h2>
              <p>Private to you · used to tune your daily fuel targets</p>
            </div>
          </div>
          <form className="settings-form" onSubmit={save}>
            <div className="profile-grid">
              <label>
                Age
                <input
                  type="number"
                  min="13"
                  max="100"
                  value={profile.age}
                  onChange={(event) =>
                    update("age", parseNumberInput(event.target.value))
                  }
                />
              </label>
              <label>
                Weight ({profile.weightUnit})
                <input
                  type="number"
                  min={profile.weightUnit === "lb" ? 66 : 30}
                  max={profile.weightUnit === "lb" ? 661 : 300}
                  value={displayedWeight}
                  onChange={(event) => updateWeight(event.target.value)}
                />
              </label>
              <label>
                Unit
                <select value={profile.weightUnit} onChange={(event) => changeWeightUnit(event.target.value as BodyProfile["weightUnit"]) }>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </label>
              <label>
                Height unit
                <select value={profile.heightUnit} onChange={(event) => changeHeightUnit(event.target.value as BodyProfile["heightUnit"]) }>
                  <option value="cm">Centimeters</option>
                  <option value="ft">Feet & inches</option>
                </select>
              </label>
              {profile.heightUnit === "cm" ? (
                <label>
                  Height (cm)
                  <input
                    type="number"
                    min="120"
                    max="230"
                    value={profile.heightCm}
                    onChange={(event) => update("heightCm", parseNumberInput(event.target.value))}
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
                        updateHeightInFt(Number(event.target.value) || 0, displayedHeight.inches)
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
                        updateHeightInFt(displayedHeight.feet, Number(event.target.value) || 0)
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Sex
                <select
                  value={profile.sex}
                  onChange={(event) =>
                    update("sex", event.target.value as BodyProfile["sex"])
                  }
                >
                  <option value="other">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label>
                Activity
                <select
                  value={profile.activity}
                  onChange={(event) =>
                    update(
                      "activity",
                      event.target.value as BodyProfile["activity"],
                    )
                  }
                >
                  <option value="low">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Goal
                <select
                  value={profile.goal}
                  onChange={(event) =>
                    update("goal", event.target.value as BodyProfile["goal"])
                  }
                >
                  <option value="lose">Lose fat</option>
                  <option value="maintain">Maintain</option>
                  <option value="gain">Build muscle</option>
                </select>
              </label>
            </div>
            <button className="primary" type="submit">
              Save profile <span>→</span>
            </button>
            {saved && <p className="auth-message">Profile saved.</p>}
          </form>
        </div>
        <aside className="progress-card">
          <p className="kicker">TODAY'S BALANCE</p>
          <div className="ring-row ring-row-compact">
            <NutrientRing
              value={consumed.calories}
              percent={(consumed.calories / targets.calories) * 100}
              label="Consumed"
              color="#d85d45"
            />
            <NutrientRing
              value={burned}
              percent={(burned / targets.calories) * 100}
              label="Burned"
              color="#78a598"
            />
            <NutrientRing
              value={remaining}
              percent={(Math.abs(remaining) / targets.calories) * 100}
              label={remaining < 0 ? "Over" : "Remaining"}
              color={remaining < 0 ? "#b34e3e" : "#9c8dba"}
              emphasis={remaining < 0}
            />
          </div>
          <div className="macro-breakdown">
            <div className="macro-breakdown-row">
              <span>Protein</span>
              <i><em style={{ width: `${Math.min(100, (consumed.proteinGrams / targets.proteinGrams) * 100)}%` }} /></i>
              <b>{consumed.proteinGrams}g <small>/ {targets.proteinGrams}g</small></b>
            </div>
            <div className="macro-breakdown-row">
              <span>Carbs</span>
              <i><em style={{ width: `${Math.min(100, (consumed.carbsGrams / targets.carbsGrams) * 100)}%` }} /></i>
              <b>{consumed.carbsGrams}g <small>/ {targets.carbsGrams}g</small></b>
            </div>
            <div className="macro-breakdown-row">
              <span>Fat</span>
              <i><em style={{ width: `${Math.min(100, (consumed.fatGrams / targets.fatGrams) * 100)}%` }} /></i>
              <b>{consumed.fatGrams}g <small>/ {targets.fatGrams}g</small></b>
            </div>
          </div>
          <div className="profile-counts">
            <span>
              <b>{meals}</b>
              <small>meals logged</small>
            </span>
            <span>
              <b>{workouts}</b>
              <small>workouts</small>
            </span>
            <span>
              <b>{events.length}</b>
              <small>care moments</small>
            </span>
          </div>
        </aside>
      </section>
      <section className="streak-section">
        <div className="streak-stats">
          <div>
            <p className="kicker">CURRENT STREAK</p>
            <h2>🔥 {streaks.currentStreak} <small>{streaks.currentStreak === 1 ? "day" : "days"}</small></h2>
          </div>
          <div>
            <p className="kicker">LONGEST STREAK</p>
            <h2>{streaks.longestStreak} <small>{streaks.longestStreak === 1 ? "day" : "days"}</small></h2>
          </div>
        </div>
        <ActivityCalendar activeDateKeys={streaks.activeDateKeys} />
      </section>
      <section className="history">
        <p className="kicker">ACTIVITY HISTORY</p>
        <h2>Your full record</h2>
        {events.length === 0 ? (
          <p className="empty">Your care history will appear here.</p>
        ) : (
          <>
            {events.slice(0, historyLimit).map((event) => {
              if (event.type === "MEAL") {
                return <MealDiaryRow event={event as HealthEvent<MealMetadata>} key={event.id} />;
              }
              return (
                <div className="history-row" key={event.id}>
                  <span className="event-dot" />
                  <div>
                    <b>
                      {event.type === "WORKOUT"
                        ? "Workout"
                        : event.type === "STEP_ACTIVITY"
                          ? "Steps"
                          : "Healthy moment"}
                    </b>
                    <small>
                      {new Date(event.occurredAt).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </small>
                  </div>
                </div>
              );
            })}
            {events.length > historyLimit && (
              <button
                className="text-button"
                onClick={() => setHistoryLimit((limit) => limit + HISTORY_PAGE_SIZE)}
              >
                Load more <span>→</span>
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
