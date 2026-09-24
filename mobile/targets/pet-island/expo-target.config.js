const fs = require('node:fs');
const path = require('node:path');

/**
 * The Dynamic Island widget extension, generated into ios/ at prebuild by
 * `@bacons/apple-targets` (see the plugin entry in app.json).
 *
 * WHY A SEPARATE TARGET. A Live Activity is drawn by a widget extension — a
 * second binary Apple runs outside the app — so its SwiftUI and its assets
 * cannot live in the app target. `mobile/ios/` is gitignored and regenerated,
 * which rules out adding the target by hand in Xcode; this folder is the
 * source of truth and the plugin does the Xcode work on every prebuild.
 *
 * Signing: no entitlement is needed. Live Activities are an Info.plist key
 * (`NSSupportsLiveActivities`, set in app.json), not a capability, so a free
 * personal team can sign this — unlike push, which the same team cannot. The
 * team id falls back to whatever the main app target uses.
 */
const sprites = path.join(__dirname, 'sprites');
// Paths are resolved by the plugin relative to this folder, not to the cwd.
const images = Object.fromEntries(
  fs.readdirSync(sprites)
    .filter((file) => file.endsWith('.png'))
    .map((file) => [file.replace(/\.png$/, ''), `./sprites/${file}`]),
);

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PetIsland',
  displayName: config.name ?? 'Vitto',
  // A leading dot appends to the app's own bundle id, whichever developer's it is.
  bundleIdentifier: '.petisland',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  // One still frame per sprite sheet, cut by scripts/buildIslandSprites.mjs.
  // Referenced from Swift as Image("bichonRunner") etc.
  images,
});
