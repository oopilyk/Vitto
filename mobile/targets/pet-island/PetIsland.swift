import ActivityKit
import SwiftUI
import WidgetKit

/// The pet, in the Dynamic Island and on the Lock Screen.
///
/// Everything that moves here moves without the app: the three need bars drain
/// on SwiftUI's own clock between the dates the app handed over, and the
/// countdown ticks to the moment the pet gets hungry or sleepy. When that moment
/// passes the activity goes stale (the app set it as the stale date) and the
/// view switches from a clock to "by now". The app refreshes all of it the next
/// time it opens.

@main
struct PetIslandBundle: WidgetBundle {
  var body: some Widget {
    PetActivity()
  }
}

struct PetActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PetActivityAttributes.self) { context in
      LockScreenView(state: context.state, stale: context.isStale)
        .padding(14)
        .activityBackgroundTint(Palette.ground)
        .activitySystemActionForegroundColor(Palette.ink)
    } dynamicIsland: { context in
      let state = context.state
      let stale = context.isStale
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Sprite(name: state.sprite)
            .frame(width: 44, height: 44)
            .padding(.leading, 2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          NextNeed(state: state, stale: stale, compact: false)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(state.name)
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(.white)
            Text(Headline.text(state: state, stale: stale))
              .font(.system(size: 12))
              .foregroundStyle(Palette.tint(state.mood))
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          Bars(state: state)
            .padding(.top, 4)
        }
      } compactLeading: {
        Sprite(name: state.sprite)
          .frame(width: 22, height: 22)
      } compactTrailing: {
        NextNeed(state: state, stale: stale, compact: true)
      } minimal: {
        Sprite(name: state.sprite)
          .frame(width: 20, height: 20)
      }
      .keylineTint(Palette.tint(state.mood))
    }
  }
}

// MARK: - Lock Screen

struct LockScreenView: View {
  let state: PetActivityAttributes.ContentState
  let stale: Bool

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      Sprite(name: state.sprite)
        .frame(width: 56, height: 56)
      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .firstTextBaseline) {
          Text(state.name)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Palette.ink)
          Spacer(minLength: 8)
          NextNeed(state: state, stale: stale, compact: false)
        }
        Text(Headline.text(state: state, stale: stale))
          .font(.system(size: 13))
          .foregroundStyle(Palette.tint(state.mood))
        Bars(state: state)
      }
    }
  }
}

// MARK: - Pieces

/// The three needs that fall on a clock, each drawn draining on its own.
struct Bars: View {
  let state: PetActivityAttributes.ContentState

  var body: some View {
    VStack(spacing: 5) {
      NeedBar(label: "Food", from: state.nutritionFullAt, to: state.nutritionEmptyAt, tint: Palette.food)
      NeedBar(label: "Energy", from: state.energyFullAt, to: state.energyEmptyAt, tint: Palette.energy)
      NeedBar(label: "Joy", from: state.happinessFullAt, to: state.happinessEmptyAt, tint: Palette.joy)
    }
  }
}

struct NeedBar: View {
  let label: String
  let from: Date
  let to: Date
  let tint: Color

  var body: some View {
    HStack(spacing: 8) {
      Text(label)
        .font(.system(size: 10, weight: .medium, design: .monospaced))
        .foregroundStyle(Palette.inkSoft)
        .frame(width: 44, alignment: .leading)
      // A ClosedRange must be ordered; an already-empty bar gets a one-second
      // span in the past, which draws as empty rather than crashing the island.
      ProgressView(timerInterval: Clamp.range(from, to), countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
        .progressViewStyle(.linear)
        .tint(tint)
        .frame(height: 6)
    }
  }
}

/// When it next stops being fine: a live countdown, or "by now" once the
/// moment has passed and the activity is stale.
struct NextNeed: View {
  let state: PetActivityAttributes.ContentState
  let stale: Bool
  let compact: Bool

  var body: some View {
    if let at = state.nextNeedAt, let need = state.nextNeed, !stale, at > Date() {
      if compact {
        Text(timerInterval: Date()...at, countsDown: true, showsHours: true)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .monospacedDigit()
          .foregroundStyle(Palette.tint(need))
          .frame(maxWidth: 58)
          .multilineTextAlignment(.trailing)
      } else {
        VStack(alignment: .trailing, spacing: 1) {
          Text(timerInterval: Date()...at, countsDown: true, showsHours: true)
            .font(.system(size: 14, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .foregroundStyle(Palette.tint(need))
          Text("until \(need)")
            .font(.system(size: 10))
            .foregroundStyle(Palette.inkSoft)
        }
        .frame(maxWidth: 88, alignment: .trailing)
      }
    } else {
      Text(compact ? Headline.word(state: state, stale: stale) : Headline.word(state: state, stale: stale))
        .font(.system(size: compact ? 12 : 13, weight: .semibold))
        .foregroundStyle(Palette.tint(Headline.mood(state: state, stale: stale)))
        .lineLimit(1)
    }
  }
}

struct Sprite: View {
  let name: String

  var body: some View {
    if UIImage(named: name) != nil {
      Image(name)
        .resizable()
        .interpolation(.none)   // pixel art stays crisp when shrunk
        .scaledToFit()
    } else {
      Image(systemName: "pawprint.fill")
        .resizable()
        .scaledToFit()
        .foregroundStyle(Palette.inkSoft)
    }
  }
}

// MARK: - Words and colours

enum Headline {
  /// Once the countdown has passed the pet is, as far as anyone knows, in that
  /// state — say so rather than show a clock stuck at zero.
  static func mood(state: PetActivityAttributes.ContentState, stale: Bool) -> String {
    if stale, let need = state.nextNeed { return need }
    return state.mood
  }

  static func word(state: PetActivityAttributes.ContentState, stale: Bool) -> String {
    switch mood(state: state, stale: stale) {
    case "bright": return "happy"
    case "content": return "fine"
    case "sleepy": return "sleepy"
    case "hungry": return "hungry"
    default: return state.mood
    }
  }

  static func text(state: PetActivityAttributes.ContentState, stale: Bool) -> String {
    if stale, let need = state.nextNeed { return "\(state.name) is \(need) by now" }
    return state.headline
  }
}

enum Palette {
  static let ground = Color(red: 0.10, green: 0.12, blue: 0.11)
  static let ink = Color.white
  static let inkSoft = Color.white.opacity(0.62)
  static let food = Color(red: 0.96, green: 0.62, blue: 0.36)
  static let energy = Color(red: 0.55, green: 0.72, blue: 0.96)
  static let joy = Color(red: 0.98, green: 0.80, blue: 0.40)

  static func tint(_ mood: String) -> Color {
    switch mood {
    case "hungry": return Color(red: 0.93, green: 0.45, blue: 0.35)
    case "sleepy": return Color(red: 0.70, green: 0.62, blue: 0.90)
    case "bright": return Color(red: 0.55, green: 0.82, blue: 0.62)
    default: return Color(red: 0.78, green: 0.84, blue: 0.80)
    }
  }
}

enum Clamp {
  static func range(_ from: Date, _ to: Date) -> ClosedRange<Date> {
    if to > from { return from...to }
    let end = min(to, Date())
    return end.addingTimeInterval(-1)...end
  }
}
