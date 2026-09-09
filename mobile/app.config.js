/**
 * Bundle identity, overridable per developer.
 *
 * `expo prebuild` regenerates ios/ and android/ from the Expo config, so a
 * bundle id set by hand in Xcode is wiped on every rebuild. `com.vitto.app` is
 * already registered to another team, so a second developer cannot sign with
 * it — which meant re-fixing signing in Xcode after every prebuild.
 *
 * Set VITTO_IOS_BUNDLE_ID (and VITTO_ANDROID_PACKAGE if needed) in
 * mobile/.env.local, which is gitignored, to build under your own id. Unset —
 * CI, and anyone who has not opted in — this returns exactly what app.json
 * already said, so the shipped identity is unchanged.
 */
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    bundleIdentifier: process.env.VITTO_IOS_BUNDLE_ID ?? config.ios?.bundleIdentifier,
  },
  android: {
    ...config.android,
    package: process.env.VITTO_ANDROID_PACKAGE ?? config.android?.package,
  },
});
