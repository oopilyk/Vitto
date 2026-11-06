/**
 * Bundle identity, overridable per developer.
 *
 * `expo prebuild` regenerates ios/ and android/ from the Expo config, so a
 * bundle id set by hand in Xcode is wiped on every rebuild.
 *
 * The shipped identity is in app.json: `com.getvitto.app`, signed by Vitto's
 * Apple Developer team (97N7H43FHH). Another developer, who cannot sign for
 * that team, sets VITTO_IOS_BUNDLE_ID and VITTO_APPLE_TEAM_ID (and
 * VITTO_ANDROID_PACKAGE if needed) in mobile/.env.local, which is gitignored,
 * to build under their own. Unset, this returns exactly what app.json says.
 */
module.exports = ({ config }) => {
  const bundleIdentifier = process.env.VITTO_IOS_BUNDLE_ID ?? config.ios?.bundleIdentifier;
  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier,
      // Signs the Dynamic Island widget target (targets/pet-island) as well as
      // the app.
      appleTeamId: process.env.VITTO_APPLE_TEAM_ID ?? config.ios?.appleTeamId,
      // Shared with the widget extension, which reads the Home Screen widget's
      // snapshot from it. Named after the bundle id, so it follows a developer's
      // own; both sides of the Swift work the name out the same way.
      entitlements: {
        ...config.ios?.entitlements,
        'com.apple.security.application-groups': [`group.${bundleIdentifier}`],
      },
    },
    android: {
      ...config.android,
      package: process.env.VITTO_ANDROID_PACKAGE ?? config.android?.package,
    },
  };
};
