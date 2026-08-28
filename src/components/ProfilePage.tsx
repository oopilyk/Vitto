import { useState } from "react";
import type { HealthEvent, MealMetadata } from "../domain/health";
import {
  calculateMacroTargets,
  parseNumberInput,
  type BodyProfile,
} from "../domain/macroTargets";

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
  const displayedWeight = profile.weightUnit === "lb" ? Math.round(profile.weightKg * 2.20462 * 10) / 10 : profile.weightKg;
  const updateWeight = (value: string) => update("weightKg", profile.weightUnit === "lb" ? parseNumberInput(value) / 2.20462 : parseNumberInput(value));
  const meals = events.filter((event) => event.type === "MEAL").length;
  const workouts = events.filter((event) => event.type === "WORKOUT").length;

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
                    update("age", Number(event.target.value))
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
                <select value={profile.weightUnit} onChange={(event) => update("weightUnit", event.target.value as BodyProfile["weightUnit"]) }>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </label>
              <label>
                Height (cm)
                <input
                  type="number"
                  min="120"
                  max="230"
                  value={profile.heightCm}
                  onChange={(event) =>
                    update("heightCm", Number(event.target.value))
                  }
                />
              </label>
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
          <p className="kicker">DAILY TARGETS</p>
          <h2>
            {targets.calories} <small>kcal</small>
          </h2>
          <div className="target-row">
            <span>Protein</span>
            <b>{targets.proteinGrams}g</b>
          </div>
          <div className="target-row">
            <span>Carbs</span>
            <b>{targets.carbsGrams}g</b>
          </div>
          <div className="target-row">
            <span>Fat</span>
            <b>{targets.fatGrams}g</b>
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
      <section className="history">
        <p className="kicker">ACTIVITY HISTORY</p>
        <h2>Recent care</h2>
        {events.length === 0 ? (
          <p className="empty">Your care history will appear here.</p>
        ) : (
          events.slice(0, 10).map((event) => (
            <div className="history-row" key={event.id}>
              <span className="event-dot" />
              <div>
                <b>
                  {event.type === "MEAL"
                    ? `Meal${(event.metadata as MealMetadata).analysis?.grade ? ` · Grade ${(event.metadata as MealMetadata).analysis?.grade}` : ""}`
                    : event.type === "WORKOUT"
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
          ))
        )}
      </section>
    </main>
  );
}
