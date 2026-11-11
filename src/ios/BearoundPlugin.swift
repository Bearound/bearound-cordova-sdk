import Foundation
import UIKit
import BearoundSDK
#if canImport(Cordova)
import Cordova
#endif

/// Cordova bridge to the native Bearound iOS SDK.
///
/// Every action answers its callback: a missing answer would leave the JavaScript promise
/// pending forever, so failures are sent back as `{code, message}`.
@objc(BearoundPlugin)
public final class BearoundPlugin: CDVPlugin {

  private var eventCallbackId: String?
  private var bridge: BearoundCordovaBridge { BearoundCordovaBridge.shared }

  public override func pluginInitialize() {
    // Normally already done by the launch hook; kept here as a safety net for hosts with
    // a custom app delegate, so foreground events still reach JavaScript.
    DispatchQueue.main.async {
      if BeAroundSDK.shared.delegate == nil {
        BeAroundSDK.shared.delegate = self.bridge
      }
    }
  }

  // Page navigation or reload: the old JS context is gone, the next page subscribes again.
  public override func onReset() {
    releaseEventChannel()
  }

  public override func dispose() {
    releaseEventChannel()
    super.dispose()
  }

  // MARK: - Events

  @objc(registerEventChannel:)
  func registerEventChannel(_ command: CDVInvokedUrlCommand) {
    eventCallbackId = command.callbackId
    bridge.attach { [weak self] name, payload in
      guard let self = self, let callbackId = self.eventCallbackId else { return }
      let result = CDVPluginResult(status: .ok, messageAs: ["event": name, "payload": payload])
      result.setKeepCallbackAs(true)
      self.commandDelegate.send(result, callbackId: callbackId)
    }
    // Seed the page with the adapter state so it does not have to poll.
    bridge.emit("bluetoothState", ["state": bridge.currentBluetoothState()])
  }

  private func releaseEventChannel() {
    bridge.detach()
    eventCallbackId = nil
  }

  // MARK: - Configuration and scanning

  @objc(configure:)
  func configure(_ command: CDVInvokedUrlCommand) {
    let config = dictionary(command, 0)
    let token = (config["businessToken"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !token.isEmpty else {
      reject(command, "INVALID_ARGUMENT", "Business token is required")
      return
    }
    background {
      self.bridge.configure(config)
      self.resolve(command)
    }
  }

  @objc(startScanning:)
  func startScanning(_ command: CDVInvokedUrlCommand) {
    bridge.startScanning()
    resolve(command)
  }

  @objc(stopScanning:)
  func stopScanning(_ command: CDVInvokedUrlCommand) {
    bridge.stopScanning()
    resolve(command)
  }

  @objc(isScanning:)
  func isScanning(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.isScanning()) }
  }

  @objc(setUserProperties:)
  func setUserProperties(_ command: CDVInvokedUrlCommand) {
    bridge.setUserProperties(dictionary(command, 0))
    resolve(command)
  }

  @objc(clearUserProperties:)
  func clearUserProperties(_ command: CDVInvokedUrlCommand) {
    bridge.clearUserProperties()
    resolve(command)
  }

  // MARK: - Push

  @objc(setPushToken:)
  func setPushToken(_ command: CDVInvokedUrlCommand) {
    let token = (command.argument(at: 0) as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !token.isEmpty else {
      reject(command, "INVALID_ARGUMENT", "Push token is required")
      return
    }
    bridge.setPushToken(token)
    resolve(command)
  }

  @objc(handleRemoteMessage:)
  func handleRemoteMessage(_ command: CDVInvokedUrlCommand) {
    resolve(command, bridge.handleRemoteMessage(dictionary(command, 0)))
  }

  @objc(trackNotificationOpened:)
  func trackNotificationOpened(_ command: CDVInvokedUrlCommand) {
    bridge.trackNotificationOpened(dictionary(command, 0))
    resolve(command)
  }

  @objc(setErrorReportingEnabled:)
  func setErrorReportingEnabled(_ command: CDVInvokedUrlCommand) {
    bridge.setErrorReportingEnabled((command.argument(at: 0) as? NSNumber)?.boolValue ?? true)
    resolve(command)
  }

  @objc(getDetectionReadiness:)
  func getDetectionReadiness(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.detectionReadiness()) }
  }

  @objc(setDebugNotificationsEnabled:)
  func setDebugNotificationsEnabled(_ command: CDVInvokedUrlCommand) {
    bridge.debugNotificationsEnabled = (command.argument(at: 0) as? NSNumber)?.boolValue ?? false
    resolve(command)
  }

  @objc(isDebugNotificationsEnabled:)
  func isDebugNotificationsEnabled(_ command: CDVInvokedUrlCommand) {
    resolve(command, bridge.debugNotificationsEnabled)
  }

  // MARK: - Permissions

  @objc(checkPermissions:)
  func checkPermissions(_ command: CDVInvokedUrlCommand) {
    bridge.permissionStatus { self.resolve(command, $0) }
  }

  @objc(requestForegroundPermissions:)
  func requestForegroundPermissions(_ command: CDVInvokedUrlCommand) {
    bridge.requestLocationPermission { _ in
      // Bluetooth has no request API on iOS: the system prompt appears the first time a
      // central manager is created, which the SDK does when scanning starts.
      self.bridge.permissionStatus { self.resolve(command, $0) }
    }
  }

  @objc(requestBackgroundLocation:)
  func requestBackgroundLocation(_ command: CDVInvokedUrlCommand) {
    bridge.requestLocationAuthorization("always")
    resolve(command, bridge.authorizationStatus() == "always")
  }

  @objc(requestNotificationPermission:)
  func requestNotificationPermission(_ command: CDVInvokedUrlCommand) {
    bridge.requestNotificationPermission { self.resolve(command, $0) }
  }

  @objc(checkNotificationPermission:)
  func checkNotificationPermission(_ command: CDVInvokedUrlCommand) {
    bridge.notificationPermission { self.resolve(command, $0) }
  }

  // MARK: - State and diagnostics

  @objc(getSdkVersion:)
  func getSdkVersion(_ command: CDVInvokedUrlCommand) {
    resolve(command, BeAroundSDK.version)
  }

  @objc(getCurrentScanPrecision:)
  func getCurrentScanPrecision(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.currentScanPrecision()) }
  }

  @objc(getBleDiagnosticInfo:)
  func getBleDiagnosticInfo(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.bleDiagnosticInfo()) }
  }

  @objc(getPendingBatchCount:)
  func getPendingBatchCount(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.pendingBatchCount()) }
  }

  @objc(getPendingBatches:)
  func getPendingBatches(_ command: CDVInvokedUrlCommand) {
    background {
      let result = CDVPluginResult(status: .ok, messageAs: self.bridge.pendingBatches())
      self.commandDelegate.send(result, callbackId: command.callbackId)
    }
  }

  @objc(isConfigured:)
  func isConfigured(_ command: CDVInvokedUrlCommand) {
    resolve(command, bridge.configured)
  }

  @objc(isLocationAvailable:)
  func isLocationAvailable(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, BeAroundSDK.isLocationAvailable()) }
  }

  @objc(getAuthorizationStatus:)
  func getAuthorizationStatus(_ command: CDVInvokedUrlCommand) {
    resolve(command, bridge.authorizationStatus())
  }

  @objc(getBluetoothState:)
  func getBluetoothState(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.currentBluetoothState()) }
  }

  @objc(getPersistedLog:)
  func getPersistedLog(_ command: CDVInvokedUrlCommand) {
    background { self.resolve(command, self.bridge.persistedLog()) }
  }

  @objc(clearPersistedLog:)
  func clearPersistedLog(_ command: CDVInvokedUrlCommand) {
    bridge.clearPersistedLog()
    resolve(command)
  }

  @objc(requestLocationAuthorization:)
  func requestLocationAuthorization(_ command: CDVInvokedUrlCommand) {
    bridge.requestLocationAuthorization(command.argument(at: 0) as? String ?? "always")
    resolve(command)
  }

  @objc(requestTrackingAuthorization:)
  func requestTrackingAuthorization(_ command: CDVInvokedUrlCommand) {
    bridge.requestTrackingAuthorization { self.resolve(command, $0) }
  }

  @objc(getTrackingAuthorizationStatus:)
  func getTrackingAuthorizationStatus(_ command: CDVInvokedUrlCommand) {
    resolve(command, BeAroundSDK.trackingAuthorizationStatus())
  }

  // MARK: - Android-only APIs
  //
  // iOS has no foreground service, no user-facing battery-optimization exemption and no
  // manufacturer autostart screen. These answer neutral values so the JS API is uniform:
  // "already ignoring optimizations" so hosts do not prompt, `false` for the rest.

  @objc(enableForegroundScanning:)
  func enableForegroundScanning(_ command: CDVInvokedUrlCommand) { resolve(command) }

  @objc(disableForegroundScanning:)
  func disableForegroundScanning(_ command: CDVInvokedUrlCommand) { resolve(command) }

  @objc(isForegroundScanningEnabled:)
  func isForegroundScanningEnabled(_ command: CDVInvokedUrlCommand) { resolve(command, false) }

  @objc(setForegroundNotificationContent:)
  func setForegroundNotificationContent(_ command: CDVInvokedUrlCommand) { resolve(command) }

  @objc(isIgnoringBatteryOptimizations:)
  func isIgnoringBatteryOptimizations(_ command: CDVInvokedUrlCommand) { resolve(command, true) }

  @objc(openBatteryOptimizationSettings:)
  func openBatteryOptimizationSettings(_ command: CDVInvokedUrlCommand) { resolve(command, false) }

  @objc(isAutostartManageable:)
  func isAutostartManageable(_ command: CDVInvokedUrlCommand) { resolve(command, false) }

  @objc(openManufacturerAutostartSettings:)
  func openManufacturerAutostartSettings(_ command: CDVInvokedUrlCommand) { resolve(command, false) }

  // MARK: - Helpers

  private func dictionary(_ command: CDVInvokedUrlCommand, _ index: UInt) -> [String: Any] {
    command.argument(at: index) as? [String: Any] ?? [:]
  }

  private func background(_ work: @escaping () -> Void) {
    commandDelegate.run(inBackground: work)
  }

  private func resolve(_ command: CDVInvokedUrlCommand) {
    commandDelegate.send(CDVPluginResult(status: .ok), callbackId: command.callbackId)
  }

  private func resolve(_ command: CDVInvokedUrlCommand, _ value: Bool) {
    commandDelegate.send(CDVPluginResult(status: .ok, messageAs: value), callbackId: command.callbackId)
  }

  private func resolve(_ command: CDVInvokedUrlCommand, _ value: String) {
    commandDelegate.send(CDVPluginResult(status: .ok, messageAs: value), callbackId: command.callbackId)
  }

  private func resolve(_ command: CDVInvokedUrlCommand, _ value: Int) {
    commandDelegate.send(CDVPluginResult(status: .ok, messageAs: value), callbackId: command.callbackId)
  }

  private func resolve(_ command: CDVInvokedUrlCommand, _ value: [String: Any]) {
    commandDelegate.send(CDVPluginResult(status: .ok, messageAs: value), callbackId: command.callbackId)
  }

  private func reject(_ command: CDVInvokedUrlCommand, _ code: String, _ message: String) {
    let result = CDVPluginResult(status: .error, messageAs: ["code": code, "message": message])
    commandDelegate.send(result, callbackId: command.callbackId)
  }
}
