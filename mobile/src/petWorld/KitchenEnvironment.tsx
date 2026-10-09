import { RoomActionButton } from './RoomActionButton';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

/**
 * The Kitchen: reached by tapping Kitchen in the living room, it opens the
 * existing `MealCaptureScreen` modal -- no rebuilt camera/search UI, no shop,
 * just the entry point into the flow that already exists, dressed as a distinct
 * scene. Same day/night art swap as `MainEnvironment`.
 *
 * The bottom row is laid out exactly like Main's so the buttons sit in the same
 * spots; only the leading button differs -- it's "Living room" here (back to the
 * bedroom) instead of "Kitchen". Logging a meal is the point of the scene, so it
 * gets its own button between the name card and the pet rather than a slot in
 * the row.
 */

const KITCHEN_DAY = require('../../assets/environments/kitchen-day.png');
const KITCHEN_NIGHT = require('../../assets/environments/kitchen-night.png');
/** The art's own top-edge tone -- see `EnvironmentBackdrop`. */
const DAY_TINT = '#b2978d';
const NIGHT_TINT = '#38346f';

/**
 * The kitchen's floor line — where the island meets the boards — sits lower in
 * its art than the pet's feet do on the stage, which left the pet looking
 * perched on the island rather than standing in front of it. Raising the art by
 * a fourteenth of its height brings the two together.
 */
const KITCHEN_LIFT = 0.07;

/** The art's own bottom-edge floorboards, for the strip the lift uncovers. */
const DAY_FLOOR = '#b79f84';
const NIGHT_FLOOR = '#523961';

interface KitchenEnvironmentControlsProps {
  onChooseFood: () => void;
}

/** The Kitchen's dedicated call to action, floating between the name card and
 *  the pet. Coral on white reads on both the day and night kitchen art. */
function LogMealButton({ onPress }: { onPress: () => void }) {
  return <RoomActionButton label="Log meal" onPress={onPress} />;
}

function KitchenEnvironmentControls({
  onChooseFood,
}: KitchenEnvironmentControlsProps) {
  return <LogMealButton onPress={onChooseFood} />;
}

export function kitchenEnvironment(props: KitchenEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop
        source={night ? KITCHEN_NIGHT : KITCHEN_DAY}
        lift={KITCHEN_LIFT}
        floorColor={night ? NIGHT_FLOOR : DAY_FLOOR}
      />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <KitchenEnvironmentControls {...props} />,
  };
}
