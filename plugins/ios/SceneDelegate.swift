internal import Expo
import Foundation
import React

@MainActor
protocol ExpoReactNativeFactoryProvider: AnyObject {
  var window: UIWindow? { get set }
  var reactNativeFactory: RCTReactNativeFactory? { get }
  var reactNativeFactoryModuleName: String { get }
}

@MainActor
private struct SceneEventForwarder {
  private var appDelegate: () -> ExpoAppDelegate? = {
    UIApplication.shared.delegate as? ExpoAppDelegate
  }

  func open(url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    let application = UIApplication.shared
    let observer = LinkingManagerObserver(url: url)
    _ = appDelegate()?.application(application, open: url, options: options)
    if !observer.wasNotified {
      RCTLinkingManager.application(application, open: url, options: options)
    }
  }

  func `continue`(_ userActivity: NSUserActivity) {
    let application = UIApplication.shared
    let observer = userActivity.webpageURL.map(LinkingManagerObserver.init)
    _ = appDelegate()?.application(application, continue: userActivity, restorationHandler: { _ in })
    if observer?.wasNotified != true {
      RCTLinkingManager.application(application, continue: userActivity, restorationHandler: { _ in })
    }
  }

  func willContinueUserActivity(withType type: String) {
    _ = appDelegate()?.application(UIApplication.shared, willContinueUserActivityWithType: type)
  }

  func didFailToContinueUserActivity(withType type: String, error: Error) {
    appDelegate()?.application(
      UIApplication.shared,
      didFailToContinueUserActivityWithType: type,
      error: error
    )
  }

  func didUpdate(_ userActivity: NSUserActivity) {
    appDelegate()?.application(UIApplication.shared, didUpdate: userActivity)
  }

  func didBecomeActive() {
    appDelegate()?.applicationDidBecomeActive(UIApplication.shared)
  }

  func willResignActive() {
    appDelegate()?.applicationWillResignActive(UIApplication.shared)
  }

  func willEnterForeground() {
    appDelegate()?.applicationWillEnterForeground(UIApplication.shared)
  }

  func didEnterBackground() {
    appDelegate()?.applicationDidEnterBackground(UIApplication.shared)
  }

  func perform(_ shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    guard let delegate = appDelegate() else {
      completionHandler(false)
      return
    }
    delegate.application(UIApplication.shared, performActionFor: shortcutItem, completionHandler: completionHandler)
  }
}

private final class LinkingManagerObserver: NSObject {
  private let expectedURL: String
  private(set) var wasNotified = false

  init(url: URL) {
    expectedURL = url.absoluteString
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(linkingManagerDidOpenURL(_:)),
      name: Notification.Name("RCTOpenURLNotification"),
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func linkingManagerDidOpenURL(_ notification: Notification) {
    wasNotified = wasNotified || notification.userInfo?["url"] as? String == expectedURL
  }
}

@available(iOSApplicationExtension, unavailable)
open class ExpoAppSceneDelegate: UIResponder, UIWindowSceneDelegate {
  open var window: UIWindow?
  private let forwarder = SceneEventForwarder()

  open func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? ExpoAppDelegate,
      let provider = appDelegate as? ExpoReactNativeFactoryProvider,
      let factory = provider.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    provider.window = window

    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    factory.startReactNative(
      withModuleName: provider.reactNativeFactoryModuleName,
      in: window,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    connectionOptions.urlContexts.forEach {
      forwarder.open(url: $0.url, options: Self.openURLOptions(from: $0.options))
    }
    connectionOptions.userActivities.forEach { forwarder.continue($0) }
    if let shortcutItem = connectionOptions.shortcutItem {
      forwarder.perform(shortcutItem) { _ in }
    }
  }

  open func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  open func sceneDidBecomeActive(_ scene: UIScene) {
    forwarder.didBecomeActive()
  }

  open func sceneWillResignActive(_ scene: UIScene) {
    forwarder.willResignActive()
  }

  open func sceneWillEnterForeground(_ scene: UIScene) {
    forwarder.willEnterForeground()
  }

  open func sceneDidEnterBackground(_ scene: UIScene) {
    forwarder.didEnterBackground()
  }

  open func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach {
      forwarder.open(url: $0.url, options: Self.openURLOptions(from: $0.options))
    }
  }

  open func scene(_ scene: UIScene, willContinueUserActivityWithType type: String) {
    forwarder.willContinueUserActivity(withType: type)
  }

  open func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwarder.continue(userActivity)
  }

  open func scene(
    _ scene: UIScene,
    didFailToContinueUserActivityWithType type: String,
    error: Error
  ) {
    forwarder.didFailToContinueUserActivity(withType: type, error: error)
  }

  open func scene(_ scene: UIScene, didUpdate userActivity: NSUserActivity) {
    forwarder.didUpdate(userActivity)
  }

  open func windowScene(
    _ windowScene: UIWindowScene,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    forwarder.perform(shortcutItem, completionHandler: completionHandler)
  }

  private static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let userActivity {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }

  private static func openURLOptions(
    from sceneOptions: UIScene.OpenURLOptions
  ) -> [UIApplication.OpenURLOptionsKey: Any] {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = sceneOptions.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = sceneOptions.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = sceneOptions.openInPlace
    return options
  }
}

@objc(SceneDelegate)
final class SceneDelegate: ExpoAppSceneDelegate {
  // Expo owns window creation, React Native startup, and scene-event forwarding.
}
