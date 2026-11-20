import SwiftUI
import WidgetKit

/// The pet on the Home Screen: how it is, and how today is going.
///
/// The app writes a snapshot into the App Group it shares with this extension
/// (src/services/petWidget.ts, through modules/pet-island) every time the pet
/// or the day changes, and asks WidgetKit to redraw. Between those writes the
/// timeline below carries it: the mood turns to the coming need ("hungry") at
/// the moment the app worked out, and the day's numbers go back to zero at
/// midnight, so the widget never shows yesterday as today.

struct PetWidget: Widget {
  let kind = "VittoPet"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PetWidgetProvider()) { entry in
      PetWidgetView(entry: entry)
    }
    .configurationDisplayName("Your pet")
    .description("How your pet is doing, and today's calories, macros, steps and water.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

/// What the app wrote. Times are epoch seconds, like the Island's.
struct WidgetSnapshot: Codable {
  var name: String
  var sprite: String
  var headline: String
  var mood: String
  var nextNeedAt: Double?
  var nextNeed: String?
  /// The local day the numbers below belong to.
  var dayStartsAt: Double
  var dayEndsAt: Double
  var calories: Double
  var calorieTarget: Double
  var proteinGrams: Double
  var proteinTarget: Double
  /// The rest of Today's macro bars and the pet's level. Optional: older
  /// snapshots lack them, and the views leave them out.
  var carbsGrams: Double?
  var carbsTarget: Double?
  var fatGrams: Double?
  var fatTarget: Double?
  var fiberGrams: Double?
  var fiberTarget: Double?
  var level: Double?
  var steps: Double
  var stepGoal: Double
  /// Water today and its goal, in mL, and a cup's size. Optional: older
  /// snapshots lack them.
  var waterMl: Double?
  var waterGoalMl: Double?
  var cupMl: Double?
  var imperial: Bool?
  /// The main screen's chips ("2,528 kcal left", "Workout due"), for the
  /// Lock Screen widget. Optional: older snapshots lack them.
  var goals: [WidgetGoal]?
  /// Burned today; adds to what is left to eat. Optional, like goals.
  var caloriesBurned: Double?
}

struct WidgetGoal: Codable {
  var label: String
  var done: Bool
}

extension WidgetSnapshot {
  /// Past the coming need's moment, the pet is that by now.
  func currentMood(at date: Date) -> String {
    if let when = nextNeedAt, let need = nextNeed, date.timeIntervalSince1970 >= when { return need }
    return mood
  }

  func moodWord(at date: Date) -> String {
    switch currentMood(at: date) {
    case "bright": return "happy"
    case "content": return "fine"
    case let other: return other
    }
  }

  /// Today's chips, or none once the day they were worked out for is over.
  func goals(at date: Date) -> [WidgetGoal] {
    date.timeIntervalSince1970 < dayEndsAt ? (goals ?? []) : []
  }
}

enum WidgetStore {
  static let key = "vitto.widget"

  /// The App Group is named after the app: `group.<app bundle id>`. This
  /// extension's id is the app's with ".petisland" on the end.
  static var suite: UserDefaults? {
    guard var id = Bundle.main.bundleIdentifier else { return nil }
    if id.hasSuffix(".petisland") { id.removeLast(".petisland".count) }
    return UserDefaults(suiteName: "group.\(id)")
  }

  static func load() -> WidgetSnapshot? {
    guard let text = suite?.string(forKey: key), let data = text.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

struct PetEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct PetWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> PetEntry {
    PetEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (PetEntry) -> Void) {
    completion(PetEntry(date: Date(), snapshot: WidgetStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PetEntry>) -> Void) {
    let now = Date()
    let snapshot = WidgetStore.load()
    var entries = [PetEntry(date: now, snapshot: snapshot)]
    var next = now.addingTimeInterval(6 * 60 * 60)
    if let snapshot {
      // The moments the picture changes without the app: the coming need, and midnight.
      let moments = [snapshot.nextNeedAt, snapshot.dayEndsAt]
        .compactMap { $0 }
        .map { Date(timeIntervalSince1970: $0) }
        .filter { $0 > now }
        .sorted()
      entries += moments.map { PetEntry(date: $0, snapshot: snapshot) }
      if let last = moments.last { next = max(next, last.addingTimeInterval(60)) }
    }
    completion(Timeline(entries: entries, policy: .after(next)))
  }
}

// MARK: - Views

/// The widget's colours: the app's Clean coral palette (src/theme.ts), light
/// or dark with the phone, and Today's macro colours. The Island keeps its own
/// always-dark Palette (PetIsland.swift).
enum Theme {
  static let ground = Color(light: 0xFFFFFF, dark: 0x1C1C1F)
  static let tile = Color(light: 0xF2F2F4, dark: 0x26262A)
  static let ink = Color(light: 0x17171A, dark: 0xF4F4F5)
  static let inkSoft = Color(light: 0x5E5E66, dark: 0xA1A1AA)
  static let track = Color(light: 0xE9E9ED, dark: 0x2C2C31)
  static let coral = Color(light: 0xC25A3E, dark: 0xD8775A)
  static let protein = Color(light: 0x3F78C8, dark: 0x7AA7EC)
  static let carbs = Color(light: 0xC9962A, dark: 0xE3B552)
  static let fat = Color(light: 0x8B7BC4, dark: 0xA99BE0)
  static let fiber = Color(light: 0x4F9A6B, dark: 0x73C08F)
  static let steps = Color(light: 0x2A8F86, dark: 0x4FC1B5)
  static let water = Color(light: 0x4A8DBA, dark: 0x6FAEDA)

  static func mood(_ mood: String) -> Color {
    switch mood {
    case "hungry": return Color(light: 0xC0503D, dark: 0xF2826F)
    case "sleepy": return Color(light: 0x7A68B8, dark: 0xB4A6EA)
    case "bright": return Color(light: 0x2F7A4A, dark: 0x8FD0A4)
    default: return inkSoft
    }
  }
}

extension Color {
  /// One colour for light mode and one for dark, as hex.
  init(light: UInt32, dark: UInt32) {
    self.init(UIColor { traits in
      let hex = traits.userInterfaceStyle == .dark ? dark : light
      return UIColor(
        red: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: 1
      )
    })
  }
}

struct PetWidgetView: View {
  let entry: PetEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        let today = DayNumbers(snapshot: snapshot, at: entry.date)
        switch family {
        case .systemLarge: LargeLayout(snapshot: snapshot, today: today, at: entry.date)
        case .systemMedium: MediumLayout(snapshot: snapshot, today: today, at: entry.date)
        default: SmallLayout(snapshot: snapshot, today: today, at: entry.date)
        }
      } else {
        VStack(spacing: 8) {
          Image(systemName: "pawprint.fill")
            .font(.system(size: 26))
            .foregroundStyle(Theme.coral)
          Text("Open Vitto to see your pet here")
            .font(.system(size: 12, weight: .medium))
            .multilineTextAlignment(.center)
            .foregroundStyle(Theme.inkSoft)
        }
      }
    }
    .widgetURL(URL(string: "vitto://"))
    .widgetBackground(Theme.ground)
  }
}

// MARK: Layouts

/// The pet, its name and mood, and how much is left to eat.
struct SmallLayout: View {
  let snapshot: WidgetSnapshot
  let today: DayNumbers
  let at: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PetTile(sprite: snapshot.sprite, size: 64)
      Spacer(minLength: 6)
      NameLine(snapshot: snapshot, at: at, size: 15)
      Spacer(minLength: 6)
      CaloriesLeft(today: today, size: 13)
      Bar(fraction: today.calorieFraction, tint: Theme.coral, height: 6)
        .padding(.top, 4)
    }
  }
}

/// The pet beside today's calories, macros, steps and water.
struct MediumLayout: View {
  let snapshot: WidgetSnapshot
  let today: DayNumbers
  let at: Date

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 6) {
        PetTile(sprite: snapshot.sprite, size: 78)
        NameLine(snapshot: snapshot, at: at, size: 14)
      }
      .frame(width: 104, alignment: .leading)

      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 10) {
          Ring(fraction: today.calorieFraction, tint: Theme.coral, lineWidth: 5)
            .frame(width: 34, height: 34)
          CaloriesLeft(today: today, size: 15)
        }
        HStack(spacing: 8) {
          MacroBar(label: "Protein", value: today.protein, target: snapshot.proteinTarget, tint: Theme.protein)
          if let carbs = today.carbs, let target = snapshot.carbsTarget {
            MacroBar(label: "Carbs", value: carbs, target: target, tint: Theme.carbs)
          }
          if let fat = today.fat, let target = snapshot.fatTarget {
            MacroBar(label: "Fat", value: fat, target: target, tint: Theme.fat)
          }
        }
        HStack(spacing: 6) {
          Chip(icon: "figure.walk", text: Int(today.steps).formatted(), tint: Theme.steps)
          Chip(icon: "drop.fill", text: today.waterLabel, tint: Theme.water)
        }
      }
    }
  }
}

/// Everything: the pet, calories, all four macros, steps, water and the day's goals.
struct LargeLayout: View {
  let snapshot: WidgetSnapshot
  let today: DayNumbers
  let at: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        PetTile(sprite: snapshot.sprite, size: 64)
        VStack(alignment: .leading, spacing: 2) {
          NameLine(snapshot: snapshot, at: at, size: 17)
          Text(snapshot.headline)
            .font(.system(size: 12))
            .foregroundStyle(Theme.inkSoft)
            .lineLimit(2)
        }
        Spacer(minLength: 0)
      }

      HStack(spacing: 12) {
        Ring(fraction: today.calorieFraction, tint: Theme.coral, lineWidth: 6)
          .frame(width: 44, height: 44)
        VStack(alignment: .leading, spacing: 1) {
          CaloriesLeft(today: today, size: 17)
          Text("\(Int(today.calories.rounded()).formatted()) of \(Int(today.calorieBudget.rounded()).formatted()) kcal")
            .font(.system(size: 11).monospacedDigit())
            .foregroundStyle(Theme.inkSoft)
        }
      }

      VStack(spacing: 7) {
        Meter(label: "Protein", value: today.protein, target: snapshot.proteinTarget, unit: "g", tint: Theme.protein)
        if let carbs = today.carbs, let target = snapshot.carbsTarget {
          Meter(label: "Carbs", value: carbs, target: target, unit: "g", tint: Theme.carbs)
        }
        if let fat = today.fat, let target = snapshot.fatTarget {
          Meter(label: "Fat", value: fat, target: target, unit: "g", tint: Theme.fat)
        }
        if let fiber = today.fiber, let target = snapshot.fiberTarget, target > 0 {
          Meter(label: "Fiber", value: fiber, target: target, unit: "g", tint: Theme.fiber)
        }
        Meter(label: "Steps", value: today.steps, target: snapshot.stepGoal, unit: "", tint: Theme.steps)
        Meter(label: "Water", value: today.water, target: today.waterGoal, unit: today.waterUnit, tint: Theme.water)
      }

      // The calorie chip says what the ring above already does.
      let goals = snapshot.goals(at: at).filter { !$0.label.contains("kcal") }
      if !goals.isEmpty {
        HStack(spacing: 6) {
          ForEach(Array(goals.prefix(3).enumerated()), id: \.offset) { _, goal in
            GoalChip(goal: goal)
          }
        }
      }
      Spacer(minLength: 0)
    }
  }
}

// MARK: Pieces

/// The pet's sprite on a soft rounded tile.
struct PetTile: View {
  let sprite: String
  let size: CGFloat

  var body: some View {
    // The sprite frames carry a lot of air round the pet, so it is drawn past
    // the tile's edge and the tile clips it.
    Sprite(name: sprite)
      .frame(width: size, height: size)
      .scaleEffect(1.35, anchor: .center)
      .offset(y: size * 0.04)
      .frame(width: size, height: size)
      .background(Theme.tile)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
  }
}

/// "Blue" with its level, then a dot and the mood word.
struct NameLine: View {
  let snapshot: WidgetSnapshot
  let at: Date
  let size: CGFloat

  var body: some View {
    let mood = snapshot.currentMood(at: at)
    VStack(alignment: .leading, spacing: 2) {
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(snapshot.name)
          .font(.system(size: size, weight: .bold))
          .foregroundStyle(Theme.ink)
          .lineLimit(1)
        if let level = snapshot.level {
          Text("Lv \(Int(level))")
            .font(.system(size: size * 0.72, weight: .semibold).monospacedDigit())
            .foregroundStyle(Theme.inkSoft)
            .lineLimit(1)
            .fixedSize()
        }
      }
      HStack(spacing: 4) {
        Circle().fill(Theme.mood(mood)).frame(width: 6, height: 6)
        Text(snapshot.moodWord(at: at).capitalized)
          .font(.system(size: max(11, size * 0.75), weight: .medium))
          .foregroundStyle(Theme.mood(mood))
          .lineLimit(1)
      }
    }
  }
}

/// "1,420 kcal left", or "120 kcal over" past the budget.
struct CaloriesLeft: View {
  let today: DayNumbers
  let size: CGFloat

  var body: some View {
    let left = today.calorieBudget - today.calories
    HStack(alignment: .firstTextBaseline, spacing: 3) {
      Text(Int(abs(left).rounded()).formatted())
        .font(.system(size: size + 5, weight: .bold).monospacedDigit())
        .foregroundStyle(Theme.ink)
      Text(left >= 0 ? "kcal left" : "kcal over")
        .font(.system(size: size - 2, weight: .medium))
        .foregroundStyle(left >= 0 ? Theme.inkSoft : Theme.mood("hungry"))
    }
    .lineLimit(1)
    .minimumScaleFactor(0.8)
  }
}

/// A thick rounded bar.
struct Bar: View {
  let fraction: Double
  let tint: Color
  var height: CGFloat = 6

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Theme.track)
        Capsule().fill(tint).frame(width: max(fraction > 0 ? height : 0, geo.size.width * fraction))
      }
    }
    .frame(height: height)
  }
}

/// A ring that fills clockwise from the top.
struct Ring: View {
  let fraction: Double
  let tint: Color
  let lineWidth: CGFloat

  var body: some View {
    ZStack {
      Circle().stroke(Theme.track, lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: fraction)
        .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
  }
}

/// A macro in a third of the row: its name, grams, and a bar.
struct MacroBar: View {
  let label: String
  let value: Double
  let target: Double
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label)
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(Theme.inkSoft)
        .lineLimit(1)
      Text("\(Int(value.rounded()))g")
        .font(.system(size: 12, weight: .semibold).monospacedDigit())
        .foregroundStyle(Theme.ink)
        .lineLimit(1)
      Bar(fraction: target > 0 ? min(1, value / target) : 0, tint: tint, height: 4)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A small tinted pill: an icon and a figure.
struct Chip: View {
  let icon: String
  let text: String
  let tint: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: icon)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(tint)
      Text(text)
        .font(.system(size: 11, weight: .semibold).monospacedDigit())
        .foregroundStyle(Theme.ink)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .padding(.horizontal, 7)
    .padding(.vertical, 4)
    .background(tint.opacity(0.14), in: Capsule())
  }
}

/// One of the main screen's chips ("Workout due"), ticked when done.
struct GoalChip: View {
  let goal: WidgetGoal

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: goal.done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(goal.done ? Theme.fiber : Theme.inkSoft)
      Text(goal.label)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(goal.done ? Theme.inkSoft : Theme.ink)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 5)
    .background(Theme.tile, in: Capsule())
  }
}

/// Today's numbers, or zeros once the day they were counted on is over.
struct DayNumbers {
  let calories: Double
  /// The target plus what was burned: what "kcal left" counts down from, as in the app.
  let calorieBudget: Double
  let protein: Double
  let carbs: Double?
  let fat: Double?
  let fiber: Double?
  let steps: Double
  /// In the person's own unit: mL, or fl oz.
  let water: Double
  let waterGoal: Double
  let waterUnit: String

  init(snapshot: WidgetSnapshot, at date: Date) {
    let current = date.timeIntervalSince1970 < snapshot.dayEndsAt
    calories = current ? snapshot.calories : 0
    calorieBudget = snapshot.calorieTarget + (current ? snapshot.caloriesBurned ?? 0 : 0)
    protein = current ? snapshot.proteinGrams : 0
    carbs = snapshot.carbsGrams.map { current ? $0 : 0 }
    fat = snapshot.fatGrams.map { current ? $0 : 0 }
    fiber = snapshot.fiberGrams.map { current ? $0 : 0 }
    steps = current ? snapshot.steps : 0
    let perUnit = (snapshot.imperial ?? false) ? 29.5735 : 1
    water = current ? (snapshot.waterMl ?? 0) / perUnit : 0
    waterGoal = (snapshot.waterGoalMl ?? 2000) / perUnit
    waterUnit = (snapshot.imperial ?? false) ? "fl oz" : "mL"
  }

  var calorieFraction: Double { calorieBudget > 0 ? min(1, max(0, calories / calorieBudget)) : 0 }

  /// "34 fl oz" or "1,250 mL", whole numbers.
  var waterLabel: String { "\(Int(water.rounded()).formatted()) \(waterUnit)" }
}

/// A labelled bar: the name, the amount against its target, and the bar.
struct Meter: View {
  let label: String
  let value: Double
  let target: Double
  let unit: String
  let tint: Color

  private var fraction: Double { target > 0 ? min(1, max(0, value / target)) : 0 }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(label)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Theme.inkSoft)
        Spacer(minLength: 4)
        // foregroundColor, not foregroundStyle: joined Text takes only the older one before iOS 17.
        Text(Int(value.rounded()).formatted())
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundColor(Theme.ink)
        + Text(" / \(Int(target.rounded()).formatted())\(unit.isEmpty ? "" : unit == "g" ? "g" : " \(unit)")")
          .font(.system(size: 11).monospacedDigit())
          .foregroundColor(Theme.inkSoft)
      }
      .lineLimit(1)
      Bar(fraction: fraction, tint: tint, height: 5)
    }
  }
}

extension View {
  /// iOS 17 asks a widget for its background this way; 16 takes a plain one.
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      padding().background(color)
    }
  }
}
