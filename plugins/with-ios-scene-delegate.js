// Adopts the UIScene lifecycle (required by apps built with the iOS 27 SDK) on every prebuild.
// Remove once the Expo template generates this itself.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const MARKER = '// with-ios-scene-delegate';

const CONFORMANCE_RE =
  /class AppDelegate: ExpoAppDelegate(?!, ExpoReactNativeFactoryProvider)\s*\{/;
const WINDOW_BLOCK_RE =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n\n?/;

function transformAppDelegate(src) {
  if (src.includes(MARKER)) {
    return src;
  }
  if (!CONFORMANCE_RE.test(src)) {
    throw new Error(
      'with-ios-scene-delegate: could not find "class AppDelegate: ExpoAppDelegate" in AppDelegate.swift',
    );
  }
  if (!WINDOW_BLOCK_RE.test(src)) {
    throw new Error(
      'with-ios-scene-delegate: could not find the UIWindow/startReactNative block in AppDelegate.swift',
    );
  }
  const out = src
    .replace(CONFORMANCE_RE, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(WINDOW_BLOCK_RE, '');
  return `${out.trimEnd()}\n\n${MARKER}\n@objc(SceneDelegate) class SceneDelegate: ExpoAppSceneDelegate {}\n`;
}

function withIosSceneDelegate(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('with-ios-scene-delegate: only Swift AppDelegate is supported');
    }
    c.modResults.contents = transformAppDelegate(c.modResults.contents);
    return c;
  });
}

module.exports = withIosSceneDelegate;
module.exports.transformAppDelegate = transformAppDelegate;
