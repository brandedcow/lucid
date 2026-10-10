const fs = require('fs');
const path = require('path');
const { transformAppDelegate } = require('./with-ios-scene-delegate');

const SAMPLE = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application() -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('transformAppDelegate', () => {
  it('adds conformance, removes the window block and appends SceneDelegate', () => {
    const out = transformAppDelegate(SAMPLE);
    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    expect(out).not.toContain('startReactNative');
    expect(out).not.toContain('UIWindow(frame');
    expect(out).toContain('var window: UIWindow?');
    expect(out).toContain('return super.application(application, didFinishLaunchingWithOptions');
    expect(out).toContain('@objc(SceneDelegate) class SceneDelegate: ExpoAppSceneDelegate {}');
  });

  it('is idempotent', () => {
    const once = transformAppDelegate(SAMPLE);
    expect(transformAppDelegate(once)).toBe(once);
  });

  it('throws when the class anchor is missing', () => {
    expect(() => transformAppDelegate('class Other {}')).toThrow(/class AppDelegate/);
  });

  it('throws when the window block anchor is missing', () => {
    const noBlock = SAMPLE.replace(/#if[\s\S]*#endif\n/, '');
    expect(() => transformAppDelegate(noBlock)).toThrow(/startReactNative/);
  });
});

describe('app.json', () => {
  it('registers the plugin', () => {
    const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
    expect(app.expo.plugins).toContain('./plugins/with-ios-scene-delegate');
  });
});
