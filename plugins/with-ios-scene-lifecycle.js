const fs = require('node:fs');
const path = require('node:path');
const {
  IOSConfig,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE_TEMPLATE = path.join('plugins', 'ios', 'SceneDelegate.swift');

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
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
    return config;
  });
}

function withSceneDelegateSource(config) {
  return withDangerousMod(config, ['ios', async (config) => {
    const source = path.join(config.modRequest.projectRoot, SCENE_DELEGATE_TEMPLATE);
    const destination = path.join(
      config.modRequest.platformProjectRoot,
      config.modRequest.projectName,
      'SceneDelegate.swift'
    );
    fs.copyFileSync(source, destination);

    const appDelegatePath = path.join(
      config.modRequest.platformProjectRoot,
      config.modRequest.projectName,
      'AppDelegate.swift'
    );
    const appDelegate = fs.readFileSync(appDelegatePath, 'utf8');
    if (!appDelegate.includes('ExpoReactNativeFactoryProvider')) {
      const patched = appDelegate.replace(
        /class AppDelegate: ExpoAppDelegate \{[\s\S]*?\n  \}\n\n  \/\/ Linking API/,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {\n' +
          '  var window: UIWindow?\n\n' +
          '  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?\n' +
          '  var reactNativeFactory: RCTReactNativeFactory?\n\n' +
          '  public override func application(\n' +
          '    _ application: UIApplication,\n' +
          '    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil\n' +
          '  ) -> Bool {\n' +
          '    let delegate = ReactNativeDelegate()\n' +
          '    let factory = ExpoReactNativeFactory(delegate: delegate)\n' +
          '    delegate.dependencyProvider = RCTAppDependencyProvider()\n\n' +
          '    reactNativeDelegate = delegate\n' +
          '    reactNativeFactory = factory\n\n' +
          '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n' +
          '  }\n\n' +
          '  var reactNativeFactoryModuleName: String { "main" }\n\n' +
          '  // Linking API'
      );
      fs.writeFileSync(appDelegatePath, patched);
    }

    return config;
  }]);
}

function withSceneDelegateProjectFile(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const scenePath = path.join(config.modRequest.projectName, 'SceneDelegate.swift');
    if (!project.hasFile(scenePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: scenePath,
        groupName: config.modRequest.projectName,
        project,
      });
    }
    return config;
  });
}

module.exports = function withIosSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneDelegateSource(config);
  return withSceneDelegateProjectFile(config);
};
