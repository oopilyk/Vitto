import SwiftUI
import WidgetKit

/// The pet on the Lock Screen: what is left of today, at a glance.
///
/// Reads the same snapshot as the Home Screen widget (PetWidget.swift), and
/// shows the main screen's own chips ("2,528 kcal left", "Workout due",
/// "10,000 steps left"), so the numbers always match the app. Lock Screen
/// widgets are drawn in the system's tint, so these use shape and weight, not
/// colour, to tell done from not.

struct PetLockWidget: Widget {
  let kind = "VittoLock"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PetWidgetProvider()) { entry in
      PetLockView(entry: entry)
    }
    .configurationDisplayName("Today")
    .description("Calories and steps left, and whether a workout is due.")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

struct PetLockView: View {
  let entry: PetEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        switch family {
        case .accessoryCircular: CalorieRing(snapshot: snapshot, at: entry.date)
        case .accessoryInline: Text(inline(snapshot))
        default: GoalList(snapshot: snapshot, at: entry.date)
        }
      } else {
        // "Open Vitto" until the app has written its first snapshot.
        switch family {
        case .accessoryInline: Text("Open Vitto")
        case .accessoryCircular: Image(systemName: "pawprint.fill").font(.system(size: 22))
        default: Label("Open Vitto to see today", systemImage: "pawprint.fill").font(.system(size: 13))
        }
      }
    }
    .widgetURL(URL(string: "vitto://"))
    .lockBackground()
  }

  /// The first thing still to do, or the pet's mood once everything is done.
  private func inline(_ snapshot: WidgetSnapshot) -> String {
    if let next = snapshot.goals(at: entry.date).first(where: { !$0.done }) { return "\(snapshot.name) · \(next.label)" }
    return "\(snapshot.name) is \(snapshot.moodWord(at: entry.date))"
  }
}

/// The pet's name and mood, then each chip on its own line.
struct GoalList: View {
  let snapshot: WidgetSnapshot
  let at: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      HStack(spacing: 4) {
        Image(systemName: "pawprint.fill").font(.system(size: 11))
        Text("\(snapshot.name) · \(snapshot.moodWord(at: at))")
          .font(.system(size: 13, weight: .semibold))
          .lineLimit(1)
      }
      ForEach(Array(snapshot.goals(at: at).prefix(3).enumerated()), id: \.offset) { _, goal in
        HStack(spacing: 4) {
          Image(systemName: goal.done ? "checkmark.circle.fill" : "circle")
            .font(.system(size: 10))
          Text(goal.label)
            .font(.system(size: 13, weight: goal.done ? .regular : .medium))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .opacity(goal.done ? 0.7 : 1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Calories eaten against the target, as a ring around what is left.
struct CalorieRing: View {
  let snapshot: WidgetSnapshot
  let at: Date

  var body: some View {
    let today = DayNumbers(snapshot: snapshot, at: at)
    // What the app's "kcal left" says: the target, plus what was burned, less what was eaten.
    let current = at.timeIntervalSince1970 < snapshot.dayEndsAt
    let budget = snapshot.calorieTarget + (current ? snapshot.caloriesBurned ?? 0 : 0)
    let left = max(0, budget - today.calories)
    Gauge(value: budget > 0 ? min(1, today.calories / budget) : 0) {
      Text("kcal")
    } currentValueLabel: {
      Text(left >= 1000 ? String(format: "%.1fk", left / 1000) : "\(Int(left.rounded()))")
        .font(.system(size: 14, weight: .semibold).monospacedDigit())
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .accessibilityLabel("\(Int(left.rounded())) calories left")
  }
}

extension View {
  /// iOS 17 wants a container background even on the Lock Screen; it is clear there.
  @ViewBuilder
  func lockBackground() -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(.clear, for: .widget)
    } else {
      self
    }
  }
}
