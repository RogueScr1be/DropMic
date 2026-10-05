import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const appJson = readFileSync('app.json', 'utf8');
const plugin = readFileSync('plugins/with-ios-scene-lifecycle.js', 'utf8');
const sceneDelegate = readFileSync('plugins/ios/SceneDelegate.swift', 'utf8');

describe('iOS scene lifecycle contract', () => {
  it('declares one application scene and includes its delegate in the app target', () => {
    expect(appJson).toContain('./plugins/with-ios-scene-lifecycle');
    expect(plugin).toContain('UIApplicationSceneManifest');
    expect(plugin).toContain('$(PRODUCT_MODULE_NAME).SceneDelegate');
    expect(plugin).toContain('addBuildSourceFileToGroup');
  });

  it('keeps the Expo factory in AppDelegate and starts it from the scene window', () => {
    expect(plugin).toContain('ExpoReactNativeFactoryProvider');
    expect(plugin).toContain('reactNativeFactory = factory');
    expect(plugin).not.toContain('factory.startReactNative(');
    expect(sceneDelegate).toContain('factory.startReactNative(');
    expect(sceneDelegate).toContain('UIWindow(windowScene: windowScene)');
  });

  it('rebuilds cold-start linking options and forwards URL/user-activity events once', () => {
    expect(sceneDelegate).toContain('connectionOptions.urlContexts.first?.url');
    expect(sceneDelegate).toContain('UIApplicationLaunchOptionsURLKey');
    expect(sceneDelegate).toContain('scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>)');
    expect(sceneDelegate).toContain('scene(_ scene: UIScene, continue userActivity: NSUserActivity)');
    expect(sceneDelegate).toContain('RCTOpenURLNotification');
    expect(sceneDelegate).toContain('if !observer.wasNotified');
  });
});
