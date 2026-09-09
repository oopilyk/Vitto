import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AILMENT_MESSAGE, AILMENT_PRECEDENCE, PET_BUILD_LABEL, type ForcedPetForm, type ForcedPetStatus, type HealthEvent, type MealAnalysis, type PetReaction, type PetState, assessCondition, calculateStreaks, daysWithPet, getPetBuild, hasEvolved, statValue, getStatusEffects } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ChoiceRow, Kicker, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  pet: PetState;
  events: HealthEvent[];
  reaction: PetReaction | null;
  onLogMeal: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  onOpenProfile: () => void;
  /** Opens the full stat sheet — the HUD on the pet is the way in. */
  onOpenStats: () => void;
  /** Opens the day's detail (nutrition, care, movement, mind), which used to sit under the pet. */
  onOpenToday: () => void;
  /** Letter shown in the account button — the signed-in email's initial. */
  accountInitial?: string;
  /**
   * Every pet the user cares for, and which one is on screen. Absent or single
   * for most accounts, which is what hides the switcher. Care moments feed all
   * of them either way — this only chooses what is displayed.
   */
  pets?: { id: string; name: string }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis['grade'] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
  /** Named under the kicker: "Raised with Alex". Absent for a solo pet. */
  partnerName?: string;
  /**
   * Dev tools. All absent for normal accounts, which hides the strip entirely.
   * They live here rather than on the Today screen because forcing a status is
   * only useful while the sprite is in view.
   */
  forcedAilment?: ForcedPetStatus | null;
  onForceAilment?: (status: ForcedPetStatus | null) => void;
  forcedForm?: ForcedPetForm | null;
  onForceForm?: (form: ForcedPetForm | null) => void;
  onSeedTestData?: () => void;
  onClearSeededData?: () => void;
  isSeeding?: boolean;
  /**
   * Ambient signals, live and foreground-only (see mobile/AMBIENT.md). Walking
   * folds into `isExploring` so the pet walks alongside; the gym parks a
   * dumbbell beside it. Both optional, both false everywhere they cannot be read.
   */
  isWalking?: boolean;
  atGym?: boolean;
  /** Dev tool: pretend to be walking or at the gym, so both cues can be seen at a desk. */
  forcedAmbient?: ForcedAmbient | null;
  onForceAmbient?: (state: ForcedAmbient | null) => void;
  /**
   * Dev readout of what the sensors are actually saying. Both hooks fail quietly
   * by design, so on a device "permission denied", "no such sensor" and "you are
   * standing still" all look the same — this is how you tell them apart.
   */
  ambientDebug?: {
    walkingPermission: string;
    steps: number;
    gymPermission: string;
    gymSaved: boolean;
    distance: number | null;
  };
}

interface QuickAction {
  key: string;
  label: string;
  icon: string;
  tint: string;
  ink: string;
}

/** The four things you can log, kept within thumb reach at all times. */
const QUICK_ACTIONS: QuickAction[] = [
  { key: 'meal', label: 'Meal', icon: '✣', tint: colors.yellow, ink: colors.yellowDeep },
  { key: 'workout', label: 'Workout', icon: '↗', tint: colors.coralWash, ink: colors.coralDeep },
  { key: 'steps', label: 'Steps', icon: '⁁', tint: colors.mint, ink: colors.mintDeep },
  { key: 'mind', label: 'Mind', icon: '✻', tint: colors.lilac, ink: colors.lilacDeep },
];

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

type DevAilmentChoice = ForcedPetStatus | 'live';

/**
 * Built from the precedence list so a new ailment shows up here for free.
 * 'Live' drops the override; 'Healthy' forces the well state. Both are needed:
 * on a compressed decay clock "live" is usually an ailing pet.
 */
const DEV_AILMENT_OPTIONS: { value: DevAilmentChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real stats' },
  { value: 'healthy', label: 'Healthy' },
  ...AILMENT_PRECEDENCE.map((ailment) => ({
    value: ailment as DevAilmentChoice,
    label: ailment.charAt(0).toUpperCase() + ailment.slice(1),
  })),
];

export type ForcedAmbient = 'walking' | 'gym';
type DevAmbientChoice = ForcedAmbient | 'live';

const DEV_AMBIENT_OPTIONS: { value: DevAmbientChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real sensors' },
  { value: 'walking', label: 'Walking' },
  { value: 'gym', label: 'At gym' },
];

type DevFormChoice = ForcedPetForm | 'live';

/** Forms to preview. An evolution is weeks of real training away otherwise. */
const DEV_FORM_OPTIONS: { value: DevFormChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real form' },
  { value: 'base', label: 'Base', detail: 'unevolved' },
  { value: 'runner', label: 'Runner', detail: 'evolved' },
  { value: 'lifter', label: 'Lifter', detail: 'evolved · strength' },
  { value: 'scholar', label: 'Scholar', detail: 'evolved · mind' },
];

export function DashboardScreen({
  pet,
  events,
  reaction,
  onLogMeal,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  onOpenProfile,
  onOpenStats,
  onOpenToday,
  accountInitial,
  pets,
  activePetId,
  onSelectPet,
  isAnalyzingMeal,
  isEating,
  feedingImage,
  feedingGrade,
  isCelebrating,
  isWorkingOut,
  isExploring,
  partnerName,
  forcedAilment,
  onForceAilment,
  forcedForm,
  onForceForm,
  onSeedTestData,
  onClearSeededData,
  isSeeding,
  isWalking,
  atGym,
  forcedAmbient,
  onForceAmbient,
  ambientDebug,
}: Props) {
  /**
   * The pet is given whatever is left of the screen once the top bar and the log
   * buttons have taken theirs — measured rather than guessed, since both grow
   * with the device's safe-area insets. Nothing scrolls here: the day's detail
   * lives on its own screen, so this one is the companion and nothing else.
   */
  const [screenHeight, setScreenHeight] = useState(0);
  const [topbarHeight, setTopbarHeight] = useState(0);
  const [actionBarHeight, setActionBarHeight] = useState(0);
  const petPageHeight =
    screenHeight && topbarHeight && actionBarHeight
      ? Math.max(320, screenHeight - topbarHeight - actionBarHeight)
      : undefined;
  // Dev tools live in a sheet over the bottom of the stage, closed by default.
  // Laid out in flow they wrapped to eight rows and crushed the pet to a sliver.
  const hasDevTools = Boolean(onForceAilment || onForceForm || onForceAmbient || onSeedTestData || ambientDebug);
  const [devOpen, setDevOpen] = useState(false);
  const today = new Date();
  // Read off the same projected pet the sprite uses, so the chips agree with what
  // is on screen — including while a dev force-status is applied.
  const statusEffects = getStatusEffects(pet);
  const streaks = calculateStreaks(events, today);
  // The kicker is where an evolution is announced — the sprite changing is easy
  // to miss if you were not watching for it. Before then there is no form to name,
  // so it shows the level instead.
  const formLabel = hasEvolved(pet)
    ? PET_BUILD_LABEL[getPetBuild(pet)]
    : `Level ${pet.level}`;
  // `pet` arrives already projected forward by App, so this reads the stats the
  // user is looking at rather than the stored ones.
  const condition = assessCondition(pet);

  // A forced cue wins over the sensors, the same way a forced status does.
  const walkingNow = forcedAmbient ? forcedAmbient === 'walking' : Boolean(isWalking);
  const atGymNow = forcedAmbient ? forcedAmbient === 'gym' : Boolean(atGym);

  const onQuickAction = (key: string) => {
    if (key === 'meal') return onLogMeal();
    if (key === 'workout') return onLogWorkout();
    if (key === 'steps') return onSyncSteps();
    return onTrainMind();
  };

  return (
    <View
      style={layout.screen}
      onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
    >
      <View
        style={styles.topbar}
        onLayout={(event) => setTopbarHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkLetter}>v</Text>
          </View>
          <Text style={styles.brandName}>vitto</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          onPress={onOpenProfile}
          hitSlop={8}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
        >
          <Text style={styles.avatarLetter}>
            {(accountInitial ?? pet.name.charAt(0)).toUpperCase()}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.petPage, petPageHeight ? { height: petPageHeight } : null]}>
      <View style={styles.hero}>
        {pets && pets.length > 1 && onSelectPet ? (
          <View style={styles.petSwitcher}>
            {pets.map((candidate) => {
              const selected = candidate.id === (activePetId ?? pets[0].id);
              return (
                <Pressable
                  key={candidate.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Show ${candidate.name}`}
                  onPress={() => onSelectPet(candidate.id)}
                  style={[styles.petTab, selected && styles.petTabOn]}
                >
                  <Text style={[styles.petTabLabel, selected && styles.petTabLabelOn]}>
                    {candidate.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Kicker>
          {formLabel.toUpperCase()} · DAY {daysWithPet(pet, today)} WITH{' '}
          {pet.name.toUpperCase()}
        </Kicker>
        {partnerName ? <Text style={styles.partnerLine}>Raised with {partnerName}</Text> : null}
        <Text style={styles.petName}>{pet.name}</Text>
        {/* An ailment outranks the reaction: a message about the meal you just
            logged must not sit on top of "Miso is fading". */}
        <Text style={styles.mood}>
          {condition.primary
            ? AILMENT_MESSAGE[condition.primary](pet.name)
            : (reaction?.message ?? `${pet.name} is feeling ${pet.mood}.`)}
        </Text>
        <View style={styles.heroMeta}>
          <Text style={styles.heroLabel}>
            Level {pet.level} · {pet.xp}/100 XP
          </Text>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${pet.xp}%` }]} />
          </View>
          {streaks.currentStreak > 0 ? (
            <Text style={styles.streak}>
              🔥 {streaks.currentStreak} day streak · best {streaks.longestStreak}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open today's detail"
            onPress={onOpenToday}
            hitSlop={8}
          >
            <Text style={styles.todayLink}>Today's detail →</Text>
          </Pressable>
        </View>
      </View>

      <PetAvatar
        stageStyle={styles.stageFill}
        pet={pet}
        isAnalyzingMeal={isAnalyzingMeal}
        isEating={isEating}
        feedingImage={feedingImage}
        feedingGrade={feedingGrade}
        isCelebrating={isCelebrating}
        isWorkingOut={isWorkingOut}
        isExploring={isExploring || walkingNow}
        atGym={atGymNow}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open pet stats"
          onPress={onOpenStats}
          hitSlop={6}
          style={({ pressed }) => [styles.hudTap, pressed && styles.hudTapPressed]}
        >
          <View style={styles.hud}>
            <Text style={styles.hudTitle}>VITALS</Text>
            {/* The push/pull/legs breakdown lives on the stats sheet; the HUD carries
                the single `strength` roll-up so it stays glanceable. */}
            {(
              [
                ['Strength', statValue(pet, 'strength')],
                ['Endurance', statValue(pet, 'endurance')],
                ['Mind', statValue(pet, 'mind')],
                ['Health', statValue(pet, 'health')],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.hudRow}>
                <Text style={styles.hudLabel}>{label}</Text>
                <View style={styles.hudTrack}>
                  <View style={[styles.hudFill, { width: `${value}%` }]} />
                </View>
              </View>
            ))}
            <Text style={styles.hudMore}>All stats →</Text>
          </View>
        </Pressable>
        {hasDevTools ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={devOpen ? 'Hide dev tools' : 'Show dev tools'}
            onPress={() => setDevOpen((open) => !open)}
            hitSlop={8}
            style={styles.devPill}
          >
            <Text style={styles.devPillLabel}>{devOpen ? 'DEV ▾' : 'DEV ▸'}</Text>
          </Pressable>
        ) : null}
        {hasDevTools && devOpen ? (
          <View style={styles.devSheet}>
            <ScrollView style={styles.devSheetScroll} contentContainerStyle={styles.devStrip}>
              {onForceAilment ? (
                <View style={styles.devRow}>
                  <Text style={styles.devLabel}>STATUS</Text>
                  <ChoiceRow
                    options={DEV_AILMENT_OPTIONS}
                    value={forcedAilment ?? 'live'}
                    onChange={(next) => onForceAilment(next === 'live' ? null : next)}
                  />
                </View>
              ) : null}
              {onForceForm ? (
                <View style={styles.devRow}>
                  <Text style={styles.devLabel}>FORM</Text>
                  <ChoiceRow
                    options={DEV_FORM_OPTIONS}
                    value={forcedForm ?? 'live'}
                    onChange={(next) => onForceForm(next === 'live' ? null : next)}
                  />
                </View>
              ) : null}
              {onForceAmbient ? (
                <View style={styles.devRow}>
                  <Text style={styles.devLabel}>AMBIENT</Text>
                  <ChoiceRow
                    options={DEV_AMBIENT_OPTIONS}
                    value={forcedAmbient ?? 'live'}
                    onChange={(next) => onForceAmbient(next === 'live' ? null : next)}
                  />
                </View>
              ) : null}
              {ambientDebug ? (
                <View style={styles.devRow}>
                  <Text style={styles.devLabel}>SENSORS</Text>
                  <Text style={styles.devReadout}>
                    walk {ambientDebug.walkingPermission} · {ambientDebug.steps} steps in window
                  </Text>
                  <Text style={styles.devReadout}>
                    gym {ambientDebug.gymPermission} ·{' '}
                    {ambientDebug.gymSaved
                      ? ambientDebug.distance === null
                        ? 'saved, no fix yet'
                        : `${ambientDebug.distance}m away`
                      : 'not set'}
                  </Text>
                </View>
              ) : null}
              {onSeedTestData ? (
                <View style={styles.devSeed}>
                  <Text style={styles.devLabel}>DATA</Text>
                  <TextButton
                    label={isSeeding ? 'Working…' : 'Seed 90 days'}
                    onPress={onSeedTestData}
                    disabled={isSeeding}
                  />
                  <TextButton
                    label="Clear seeded"
                    onPress={() => onClearSeededData?.()}
                    disabled={isSeeding}
                  />
                </View>
              ) : null}
                    </ScrollView>
          </View>
        ) : null}
        {statusEffects.length ? (
          <View style={styles.statusTray} pointerEvents="none">
            {statusEffects.map((effect) => (
              <View
                key={effect.id}
                style={[styles.statusChip, effect.kind === 'buff' && styles.statusChipBuff]}
                accessible
                accessibilityLabel={`${effect.label}. ${effect.detail}`}
              >
                <Text style={[styles.statusLabel, effect.kind === 'buff' && styles.statusLabelBuff]}>
                  {effect.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </PetAvatar>
      </View>

      <View
        style={styles.actionBar}
        onLayout={(event) => setActionBarHeight(event.nativeEvent.layout.height)}
      >
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={`Log ${action.label.toLowerCase()}`}
            onPress={() => onQuickAction(action.key)}
            style={({ pressed }) => [styles.barItem, pressed && styles.barItemPressed]}
          >
            <View style={[styles.barIcon, { backgroundColor: action.tint }]}>
              <Text style={{ color: action.ink, fontSize: 17 }}>{action.icon}</Text>
            </View>
            <Text style={styles.barLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkLetter: { fontFamily: fonts.display, fontSize: 16, color: '#fff' },
  brandName: { fontSize: 19, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#d8e1d6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: { opacity: 0.7 },
  avatarLetter: { fontSize: 14, fontWeight: '700', color: colors.ink },
  hero: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 26 },
  petName: { ...text.display, fontSize: 42, marginTop: 14 },
  mood: { ...text.body, marginTop: 10 },
  heroMeta: { marginTop: 20 },
  heroLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint },
  xpTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)', marginTop: 8, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: colors.coral, borderRadius: 2 },
  streak: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 10 },
  todayLink: { fontFamily: fonts.mono, fontSize: 11, color: colors.coral, marginTop: 12 },
  partnerLine: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 6, letterSpacing: 0.5 },
  // One continuous stage from the top bar to the log buttons. The hero sits on
  // the same sage as the pet rather than on a paper band above it, so the pet
  // owns the whole screen instead of the top third looking like a header.
  petPage: { justifyContent: 'flex-start', backgroundColor: colors.sage },
  stageFill: { flex: 1 },
  // Dev only. Kept tight — no hint copy — because nothing on this screen scrolls
  // and every pixel here comes straight out of the pet's stage.
  devPill: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    zIndex: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  devPillLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: '#5f7167' },
  // Over the stage, not in it: the pet keeps its full height and stays in view
  // above the sheet while a status or form is being forced.
  devSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 236,
    zIndex: 4,
    backgroundColor: 'rgba(245,242,235,0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  devSheetScroll: { maxHeight: 236 },
  devStrip: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40, gap: 6 },
  devRow: { gap: 4 },
  devLabel: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, color: '#5f7167' },
  devReadout: { fontFamily: fonts.mono, fontSize: 10, color: colors.ink },
  devSeed: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  petSwitcher: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  petTab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  petTabOn: { borderColor: colors.coral, backgroundColor: '#fdf1ee' },
  petTabLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  petTabLabelOn: { color: colors.coralDeep },
  hudTap: { position: 'absolute', top: 16, left: 16, zIndex: 2 },
  statusTray: { position: 'absolute', top: 16, right: 16, zIndex: 2, alignItems: 'flex-end', gap: 4 },
  statusChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  statusChipBuff: { backgroundColor: 'rgba(255,255,255,0.5)' },
  statusLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.3, color: '#8c4433' },
  statusLabelBuff: { color: '#55705d' },
  hudTapPressed: { opacity: 0.6 },
  hud: { width: 128 },
  hudMore: { fontFamily: fonts.mono, fontSize: 8, color: '#5f7167', marginTop: 2 },
  hudTitle: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: '#5f7167', marginBottom: 8 },
  hudRow: { marginBottom: 6 },
  hudLabel: { fontFamily: fonts.mono, fontSize: 8, color: '#55705d', marginBottom: 3 },
  hudTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)', overflow: 'hidden' },
  hudFill: { height: '100%', backgroundColor: '#55705d' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: HOME_INDICATOR_INSET,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    // Lifts the bar off the content scrolling beneath it.
    shadowColor: '#26312d',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  barItem: { alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingTop: 2 },
  barItemPressed: { opacity: 0.6 },
  barIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, letterSpacing: 0.3 },
});
