module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...(config.ios || {}),
    bundleIdentifier:
      process.env.APP_IOS_BUNDLE_IDENTIFIER ||
      config.ios?.bundleIdentifier ||
      "com.pavak01.weeklytaxapp"
  },
  android: {
    ...(config.android || {}),
    package:
      process.env.APP_ANDROID_PACKAGE ||
      config.android?.package ||
      "com.pavak01.weeklytaxapp"
  },
  extra: {
    ...(config.extra || {}),
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:4000"
  }
});