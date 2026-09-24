import ActivityKit
import ExpoModulesCore

/// The app's side of the Dynamic Island: start, refresh, end.
///
/// Thin on purpose. Every number here is worked out in JS from the same pet
/// state and decay rates the rest of the app uses (see
/// src/services/petIsland.ts); this only turns them into an ActivityKit
/// request. The view that draws them is the widget in targets/pet-island.
///
/// Times arrive as epoch seconds because a JS Date does not cross the bridge as
/// a Date.
struct IslandState: Record {
  @Field var petId: String = ""
  @Field var name: String = ""
  @Field var sprite: String = ""
  @Field var headline: String = ""
  @Field var mood: String = "content"
  @Field var health: Double = 1
  @Field var asOf: Double = 0
  @Field var nutritionFullAt: Double = 0
  @Field var nutritionEmptyAt: Double = 0
  @Field var energyFullAt: Double = 0
  @Field var energyEmptyAt: Double = 0
  @Field var happinessFullAt: Double = 0
  @Field var happinessEmptyAt: Double = 0
  @Field var nextNeedAt: Double? = nil
  @Field var nextNeed: String? = nil

  private func date(_ seconds: Double) -> Date { Date(timeIntervalSince1970: seconds) }

  var contentState: PetActivityAttributes.ContentState {
    PetActivityAttributes.ContentState(
      name: name,
      sprite: sprite,
      headline: headline,
      mood: mood,
      health: health,
      asOf: date(asOf),
      nutritionFullAt: date(nutritionFullAt),
      nutritionEmptyAt: date(nutritionEmptyAt),
      energyFullAt: date(energyFullAt),
      energyEmptyAt: date(energyEmptyAt),
      happinessFullAt: date(happinessFullAt),
      happinessEmptyAt: date(happinessEmptyAt),
      nextNeedAt: nextNeedAt.map(date),
      nextNeed: nextNeed
    )
  }

  /// The moment the shown state stops being true. Past it the system marks the
  /// activity stale and the widget says "by now" instead of counting down.
  var staleDate: Date? { nextNeedAt.map(date) }
}

public class PetIslandModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VittoPetIsland")

    /// False on devices without Live Activities, and when the person has
    /// switched them off for this app in Settings.
    Function("isAvailable") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Starts the activity, or refreshes the one already showing. One per pet:
    /// anything else that is up (an older pet, a previous install's leftover)
    /// is ended so the Island never shows two.
    AsyncFunction("sync") { (state: IslandState) async throws in
      let content = ActivityContent(state: state.contentState, staleDate: state.staleDate)
      let running = Activity<PetActivityAttributes>.activities
      if let current = running.first(where: { $0.attributes.petId == state.petId }) {
        await current.update(content)
        for other in running where other.id != current.id {
          await other.end(nil, dismissalPolicy: .immediate)
        }
      } else {
        for other in running {
          await other.end(nil, dismissalPolicy: .immediate)
        }
        _ = try Activity.request(
          attributes: PetActivityAttributes(petId: state.petId),
          content: content,
          pushType: nil
        )
      }
    }

    /// Takes the pet off the Island: sign-out, or the setting switched off.
    AsyncFunction("end") { () async in
      for activity in Activity<PetActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
