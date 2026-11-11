import Foundation
import UIKit
import BearoundSDK

/// Launch-time wiring, called by `BearoundAppDelegateHook` (Objective-C) from inside
/// `application(_:didFinishLaunchingWithOptions:)`, before any JavaScript runs.
///
/// BeAroundSDK is pure Swift and cannot be called from Objective-C, so the hook reaches
/// these entry points through the Objective-C runtime.
@objc(BearoundCordovaBootstrap)
public final class BearoundCordovaBootstrap: NSObject {

  /// When iOS relaunches the app in the background (beacon region, Bluetooth restoration,
  /// silent push), touching `BeAroundSDK.shared` restores the saved configuration and
  /// re-arms region monitoring. The delegate is a runtime object and is never persisted,
  /// so it has to be set here: the JavaScript `configure()` arrives too late.
  @objc(applicationDidFinishLaunching:launchOptions:)
  public static func applicationDidFinishLaunching(_: UIApplication, launchOptions: NSDictionary?) {
    let sdk = BeAroundSDK.shared
    let bridge = BearoundCordovaBridge.shared
    sdk.delegate = bridge

    // Must run before the app finishes launching, or BGTaskScheduler rejects it. It also
    // installs the SDK's APNs token capture, silent-push handling and notification-tap
    // tracking this early, so a push that cold-launches the app is not missed, and it
    // requests APNs registration itself (token fetch only, no user prompt). Needs the
    // Push Notifications capability (aps-environment entitlement).
    sdk.registerBackgroundTasks()

    // QA aid, off by default: after the SDK installed its own notification handling.
    bridge.installForegroundPresentation()
    let relaunchedByLocation = launchOptions?[UIApplication.LaunchOptionsKey.location.rawValue] != nil
    let relaunchedByBluetooth = launchOptions?[UIApplication.LaunchOptionsKey.bluetoothCentrals.rawValue] != nil
    if relaunchedByLocation || relaunchedByBluetooth {
      bridge.notifyRelaunchedInBackground()
    }
  }

  @objc(performFetch:)
  public static func performFetch(_ completion: @escaping (Bool) -> Void) {
    BeAroundSDK.shared.performBackgroundFetch { success in completion(success) }
  }

  /// Returns `true` when the background URL session belongs to the SDK (and the SDK now
  /// owns the completion handler), `false` when the host should handle it.
  @objc(handleBackgroundSession:completion:)
  public static func handleBackgroundSession(_ identifier: String, completion: @escaping () -> Void) -> Bool {
    guard identifier == BeAroundSDK.backgroundURLSessionIdentifier else { return false }
    BeAroundSDK.shared.handleBackgroundURLSessionEvents(identifier: identifier, completionHandler: completion)
    return true
  }
}
