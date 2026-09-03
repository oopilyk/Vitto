import type { CSSProperties, ReactNode } from "react";
import { type MealAnalysis, type PetState, assessDecline, getEvolutionStage } from '@vitto/core';

const MOOD_MOUTH: Record<PetState["mood"], string> = {
  bright: "◡",
  content: "⌣",
  sleepy: "─",
  hungry: "○",
};

const CONFETTI_PIECES = Array.from({ length: 18 }, (_, index) => ({
  index,
  x: (index % 6 - 2.5) * 34,
  y: -40 - (index % 4) * 24,
  rotation: index * 37,
}));

type PetActivity =
  | "idle"
  | "analyzing"
  | "eating"
  | "workout"
  | "exploring"
  | "celebrating";

interface PetAvatarProps {
  pet: PetState;
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis["grade"] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
  children?: ReactNode;
}

const getActivity = ({
  isCelebrating,
  isEating,
  isAnalyzingMeal,
  isWorkingOut,
  isExploring,
}: Pick<
  PetAvatarProps,
  | "isCelebrating"
  | "isEating"
  | "isAnalyzingMeal"
  | "isWorkingOut"
  | "isExploring"
>): PetActivity => {
  if (isCelebrating) return "celebrating";
  if (isEating) return "eating";
  if (isAnalyzingMeal) return "analyzing";
  if (isWorkingOut) return "workout";
  if (isExploring) return "exploring";
  return "idle";
};

const STATUS_TEXT: Record<PetActivity, (name: string) => string> = {
  celebrating: (name) => `${name} feels great!`,
  eating: (name) => `${name} is enjoying dinner`,
  analyzing: (name) => `${name} is curious about that plate`,
  workout: (name) => `${name} is training hard`,
  exploring: (name) => `${name} is exploring`,
  idle: (name) => `${name} is here`,
};

export function PetAvatar({
  pet,
  isAnalyzingMeal,
  isEating,
  feedingImage,
  feedingGrade,
  isCelebrating,
  isWorkingOut,
  isExploring,
  children,
}: PetAvatarProps) {
  const stage = getEvolutionStage(pet.level);
  const activity = getActivity({
    isCelebrating,
    isEating,
    isAnalyzingMeal,
    isWorkingOut,
    isExploring,
  });

  // Graduated visual decline: the pet loses colour and its aura fades as health
  // falls, rather than looking untouched right up until the `dying` cliff.
  // `--decline` is a 0..1 knob the stylesheet maps to a saturate()/brightness()
  // filter; `decline-<stage>` is there for coarser per-band styling.
  const decline = assessDecline(pet);

  const stageClassName = [
    "pet-stage",
    `stage-${stage}`,
    `mood-${pet.mood}`,
    `activity-${activity}`,
    `decline-${decline.stage}`,
    isEating ? "pet-eating" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const faceClassName = [
    "pet-face",
    feedingImage ? "pet-mouth-open" : "",
    isCelebrating ? "pet-happy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showHearts =
    isCelebrating && (feedingGrade === "A" || feedingGrade === "B");

  return (
    <section
      className={stageClassName}
      style={{ "--decline": decline.intensity } as CSSProperties}
    >
      {children}
      <div className="pet-aura" />
      {feedingImage && (
        <img className="feeding-food" src={feedingImage} alt="" />
      )}
      <div className="pet-ear left" />
      <div className="pet-ear right" />
      <div className={faceClassName}>
        <span className="pet-cheek left" />
        <span className="pet-cheek right" />
        <span className="pet-mouth">{MOOD_MOUTH[pet.mood]}</span>
      </div>
      {activity === "analyzing" && (
        <div className="pet-thought" aria-hidden="true">
          <span>✣</span>
        </div>
      )}
      {activity === "workout" && (
        <div className="pet-particles" aria-hidden="true">
          <span className="particle particle-a">↗</span>
          <span className="particle particle-b">↗</span>
        </div>
      )}
      {activity === "exploring" && (
        <div className="pet-particles" aria-hidden="true">
          <span className="particle particle-a">⌁</span>
          <span className="particle particle-b">⌁</span>
        </div>
      )}
      {showHearts && (
        <div className="pet-hearts" aria-hidden="true">
          <span>♥</span>
          <span>♥</span>
        </div>
      )}
      {isCelebrating && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI_PIECES.map((piece) => (
            <i
              key={piece.index}
              style={
                {
                  "--confetti-x": `${piece.x}px`,
                  "--confetti-y": `${piece.y}px`,
                  "--confetti-r": `${piece.rotation}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <span className="pet-name">
        {STATUS_TEXT[activity](pet.name)} <b>♥</b>
      </span>
    </section>
  );
}
