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
    .description("How your pet is doing, and today's food and steps.")
    .supportedFamilies([.systemSmall, .systemMedium])
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
  var steps: Double
  var stepGoal: Double
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

struct PetWidgetView: View {
  let entry: PetEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        let today = DayNumbers(snapshot: snapshot, at: entry.date)
        if family == .systemMedium {
          HStack(spacing: 14) {
            PetFace(snapshot: snapshot, at: entry.date, sprite: 64)
              .frame(maxWidth: 110)
            VStack(alignment: .leading, spacing: 9) {
              Meter(label: "Calories", value: today.calories, target: snapshot.calorieTarget, unit: "kcal", tint: Palette.food)
              Meter(label: "Protein", value: today.protein, target: snapshot.proteinTarget, unit: "g", tint: Palette.joy)
              Meter(label: "Steps", value: today.steps, target: snapshot.stepGoal, unit: "", tint: Palette.energy)
            }
          }
        } else {
          VStack(spacing: 8) {
            PetFace(snapshot: snapshot, at: entry.date, sprite: 54)
            Meter(label: "Calories", value: today.calories, target: snapshot.calorieTarget, unit: "kcal", tint: Palette.food, compact: true)
          }
        }
      } else {
        VStack(spacing: 6) {
          Image(systemName: "pawprint.fill")
            .font(.system(size: 28))
            .foregroundStyle(Palette.inkSoft)
          Text("Open Vitto to see your pet here")
            .font(.system(size: 12))
            .multilineTextAlignment(.center)
            .foregroundStyle(Palette.inkSoft)
        }
      }
    }
    .widgetURL(URL(string: "vitto://"))
    .widgetBackground(Palette.ground)
  }
}

/// Today's numbers, or zeros once the day they were counted on is over.
struct DayNumbers {
  let calories: Double
  let protein: Double
  let steps: Double

  init(snapshot: WidgetSnapshot, at date: Date) {
    let current = date.timeIntervalSince1970 < snapshot.dayEndsAt
    calories = current ? snapshot.calories : 0
    protein = current ? snapshot.proteinGrams : 0
    steps = current ? snapshot.steps : 0
  }
}

struct PetFace: View {
  let snapshot: WidgetSnapshot
  let at: Date
  let sprite: CGFloat

  /// Past the coming need's moment, the pet is that by now.
  private var need: String? {
    guard let when = snapshot.nextNeedAt, let need = snapshot.nextNeed,
          at.timeIntervalSince1970 >= when else { return nil }
    return need
  }

  private var mood: String { need ?? snapshot.mood }

  private var word: String {
    switch mood {
    case "bright": return "happy"
    case "content": return "fine"
    default: return mood
    }
  }

  var body: some View {
    VStack(spacing: 4) {
      Sprite(name: snapshot.sprite)
        .frame(width: sprite, height: sprite)
      Text(snapshot.name)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(Palette.ink)
        .lineLimit(1)
      Text(word)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(Palette.tint(mood))
        .lineLimit(1)
    }
  }
}

struct Meter: View {
  let label: String
  let value: Double
  let target: Double
  let unit: String
  let tint: Color
  var compact = false

  private var fraction: Double { target > 0 ? min(1, max(0, value / target)) : 0 }

  private var amount: String {
    let number = Int(value.rounded()).formatted()
    if compact { return "\(number) / \(Int(target.rounded()).formatted())" }
    return unit.isEmpty ? number : "\(number) \(unit)"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(alignment: .firstTextBaseline) {
        Text(label)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Palette.inkSoft)
        Spacer(minLength: 4)
        Text(amount)
          .font(.system(size: 11, weight: .semibold).monospacedDigit())
          .foregroundStyle(Palette.ink)
          .lineLimit(1)
      }
      ProgressView(value: fraction)
        .progressViewStyle(.linear)
        .tint(tint)
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
