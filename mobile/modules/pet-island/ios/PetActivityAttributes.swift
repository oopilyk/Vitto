import ActivityKit
import Foundation

/// What the Dynamic Island knows about the pet.
///
/// IDENTICAL COPY of modules/pet-island/ios/PetActivityAttributes.swift, and it
/// has to stay that way: ActivityKit pairs the app's request with the widget's
/// view by this type's name and encoding, and the two targets cannot share one
/// file without a whole extra framework. A test keeps the copies byte-equal.
///
/// Dates rather than numbers wherever something moves on its own. The widget
/// has no timer, but SwiftUI can draw a bar draining between two dates and a
/// clock counting down to one, so the Island stays alive for hours after the
/// app last spoke to it.
struct PetActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var name: String
    /// Asset name of the still frame to show; see targets/pet-island/sprites.
    var sprite: String
    /// "Blue is hungry", in the same words as the stats screen.
    var headline: String
    /// bright | content | sleepy | hungry. Picks the tint.
    var mood: String
    /// 0...1. Health does not fall on a clock, so it is drawn as it was.
    var health: Double
    /// When the bars were last known, and when each was full and will be empty
    /// at the pet's decay rate. A bar is drawn draining from full to empty, so at
    /// `asOf` it sits exactly where the app last saw it and keeps sliding.
    var asOf: Date
    var nutritionFullAt: Date
    var nutritionEmptyAt: Date
    var energyFullAt: Date
    var energyEmptyAt: Date
    var happinessFullAt: Date
    var happinessEmptyAt: Date
    /// The next moment it stops being fine — hungry or sleepy — and which.
    /// Nil once it already is not. Also the activity's stale date, so the view
    /// can say "by now" instead of showing a countdown frozen at zero.
    var nextNeedAt: Date?
    var nextNeed: String?
  }

  var petId: String
}
