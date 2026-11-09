import AppIntents
import WidgetKit

/// The widget's "+ cup": logs one cup of water without opening the app.
///
/// An extension cannot reach the app's database, so the cup is queued in the
/// App Group (`vitto.pendingWater`, with when it was tapped) and the app logs
/// it the next time it opens (drainWidgetWater in src/services/petWidget.ts).
/// The widget's own snapshot is bumped at once, so the tap shows straight away.
@available(iOS 17.0, *)
struct LogWaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Log a cup of water"
  static var description = IntentDescription("Adds one cup of water to today in Vitto.")
  /// Runs in the widget's process: no need to open the app for a cup of water.
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    guard let suite = WidgetStore.suite else { return .result() }
    var snapshot = WidgetStore.load()
    let cup = snapshot?.cupMl ?? 250

    // Queue it for the app, with the time it was drunk.
    var pending: [[String: Double]] = []
    if let text = suite.string(forKey: "vitto.pendingWater"),
       let data = text.data(using: .utf8),
       let decoded = try? JSONDecoder().decode([[String: Double]].self, from: data) {
      pending = decoded
    }
    pending.append(["ml": cup, "at": Date().timeIntervalSince1970])
    if let data = try? JSONEncoder().encode(pending), let text = String(data: data, encoding: .utf8) {
      suite.set(text, forKey: "vitto.pendingWater")
    }

    // And show it now, on today's count.
    if snapshot != nil, let today = snapshot, Date().timeIntervalSince1970 < today.dayEndsAt {
      snapshot!.waterMl = (today.waterMl ?? 0) + cup
      if let data = try? JSONEncoder().encode(snapshot!), let text = String(data: data, encoding: .utf8) {
        suite.set(text, forKey: WidgetStore.key)
      }
    }
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}
