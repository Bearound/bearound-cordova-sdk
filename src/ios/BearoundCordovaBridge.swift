import Foundation
import CoreLocation
import CoreBluetooth
import UserNotifications
import BearoundSDK

/// Process-wide delegate of the native SDK.
///
/// iOS relaunches the app in the background (beacon region, Bluetooth restoration, silent
/// push) with no web page loaded, so the delegate cannot be the plugin instance. Events go
/// to the current sink (the plugin's JS channel) or wait in a small bounded buffer until a
/// page subscribes.
@objc(BearoundCordovaBridge)
public final class BearoundCordovaBridge: NSObject, CLLocationManagerDelegate, CBCentralManagerDelegate,
  UNUserNotificationCenterDelegate, BeAroundSDKDelegate {

  public static let shared = BearoundCordovaBridge()

  static let technology = "cordova"
  private static let maxBufferedEvents = 50

  private let lock = NSLock()
  private var sink: ((String, [String: Any]) -> Void)?
  private var buffer: [(String, [String: Any])] = []

  private var permissionManager: CLLocationManager?
  private var permissionCompletion: ((Bool) -> Void)?
  private var bluetoothManager: CBCentralManager?
  private var bluetoothState = "unknown"
  private(set) var configured = false

  lazy var sdk: BeAroundSDK = {
    if Thread.isMainThread { return BeAroundSDK.shared }
    var instance: BeAroundSDK!
    DispatchQueue.main.sync { instance = BeAroundSDK.shared }
    return instance
  }()

  // MARK: - Events

  func attach(_ newSink: @escaping (String, [String: Any]) -> Void) {
    lock.lock()
    sink = newSink
    let pending = buffer
    buffer.removeAll()
    lock.unlock()
    pending.forEach { newSink($0.0, $0.1) }
  }

  func detach() {
    lock.lock()
    sink = nil
    lock.unlock()
  }

  func emit(_ name: String, _ payload: [String: Any]) {
    lock.lock()
    let current = sink
    if current == nil {
      if buffer.count >= Self.maxBufferedEvents { buffer.removeFirst() }
      buffer.append((name, payload))
    }
    lock.unlock()
    current?(name, payload)
  }

  // MARK: - Debug notifications (QA aid)
  //
  // Off by default. When on, the bridge posts a local notification for each SDK event,
  // with the same texts and cooldowns as the native example apps, so a background or
  // terminated run can be followed on the lock screen and compared side by side with them.
  // The flag is persisted: iOS relaunches the app in the background with no web page
  // loaded, and those are exactly the events worth seeing.

  private static let debugNotificationsKey = "io.bearound.cordova.debugNotifications"
  private var debugNotifyLast: [String: Date] = [:]

  var debugNotificationsEnabled: Bool {
    get { UserDefaults.standard.bool(forKey: Self.debugNotificationsKey) }
    set {
      UserDefaults.standard.set(newValue, forKey: Self.debugNotificationsKey)
      if newValue { installForegroundPresentation() }
    }
  }

  /// Without a delegate answering `willPresent`, iOS drops the banner of any notification
  /// that arrives while the app is on screen. Only installed in debug mode: it replaces
  /// the app's notification center delegate.
  func installForegroundPresentation() {
    guard debugNotificationsEnabled else { return }
    DispatchQueue.main.async { UNUserNotificationCenter.current().delegate = self }
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if #available(iOS 14.0, *) {
      completionHandler([.banner, .list, .sound])
    } else {
      completionHandler([.alert, .sound])
    }
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }

  func notifyRelaunchedInBackground() {
    debugNotify(id: "relaunch", title: "App Reativado",
                body: "BeAroundSDK detectou região de beacons em segundo plano", cooldown: 60)
  }

  private func debugNotify(id: String, title: String, body: String, cooldown: TimeInterval, sound: Bool = true) {
    guard debugNotificationsEnabled else { return }
    lock.lock()
    if let last = debugNotifyLast[id], Date().timeIntervalSince(last) < cooldown {
      lock.unlock()
      return
    }
    debugNotifyLast[id] = Date()
    lock.unlock()

    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = sound ? .default : nil
    UNUserNotificationCenter.current().add(
      UNNotificationRequest(
        identifier: "bearound.debug.\(id).\(Int(Date().timeIntervalSince1970 * 1000))",
        content: content,
        trigger: nil
      )
    )
  }

  private func plural(_ count: Int) -> String { count == 1 ? "" : "s" }

  /// A sync with zero beacons is not an empty sync: the SDK still uploads encounters, the
  /// device location and the Wi-Fi around it, so the copy names what actually went.
  private func syncBody(started: Bool, beaconCount: Int) -> String {
    if beaconCount == 0 {
      return started ? "Enviando presença: localização, Wi-Fi e aparelhos por perto"
                     : "Presença enviada (nenhum beacon no alcance)"
    }
    return started ? "Enviando \(beaconCount) beacon\(plural(beaconCount)) para o servidor"
                   : "\(beaconCount) beacon\(plural(beaconCount)) enviado\(plural(beaconCount)) com sucesso"
  }

  // MARK: - Configuration

  func configure(_ config: [String: Any]) {
    let token = (config["businessToken"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let precision = mapScanPrecision(config["scanPrecision"] as? String ?? "high")
    let maxQueued = mapMaxQueuedPayloads(number(config["maxQueuedPayloads"], 100).intValue)
    // The wire carries milliseconds; the iOS SDK takes seconds. Validation and clamping
    // live in the native SDK (single source of truth).
    let reconciliationInterval = number(config["periodicReconciliationIntervalMs"], 20 * 60 * 1000).doubleValue / 1000.0
    let scanDuration = number(config["periodicScanDurationMs"], 12_000).doubleValue / 1000.0
    let heartbeat = number(config["presenceHeartbeatIntervalMs"], 5 * 60 * 1000).doubleValue / 1000.0

    let periodicEnabled = bool(config["periodicReconciliationEnabled"], true)
    let collectAdvertisingId = bool(config["collectAdvertisingId"], true)
    let collectLocation = bool(config["collectLocation"], true)
    let collectWifi = bool(config["collectWifi"], true)
    let adaptiveSampling = bool(config["adaptiveSamplingEnabled"], true)
    // Absent means "follow collectLocation / collectWifi", the SDK's own default.
    let collectMotionSensors = (config["collectMotionSensors"] as? NSNumber)?.boolValue

    // An app calls configure() on every launch. When the SDK is already scanning with
    // this exact configuration (it restores itself when iOS relaunches the app), stopping
    // and restarting it would switch the scanner off, flush an empty sync and cancel the
    // pending background tasks, all in the middle of a background relaunch. A native app
    // does not do that either, so the scan is only cycled when something changed.
    let signature = Self.stableHash([
      token, precision.rawValue, String(maxQueued.rawValue), String(periodicEnabled),
      String(reconciliationInterval), String(scanDuration), String(heartbeat),
      String(collectAdvertisingId), String(collectLocation), String(collectWifi),
      String(adaptiveSampling), collectMotionSensors.map { String($0) } ?? "default",
    ].joined(separator: "|"))
    let unchanged = UserDefaults.standard.string(forKey: Self.configSignatureKey) == signature

    mainThreadSync {
      let wasScanning = self.sdk.isScanning
      let restart = wasScanning && !unchanged
      if restart { self.sdk.stopScanning() }

      self.sdk.configure(
        businessToken: token,
        scanPrecision: precision,
        maxQueuedPayloads: maxQueued,
        technology: Self.technology,
        periodicReconciliationEnabled: periodicEnabled,
        periodicReconciliationInterval: reconciliationInterval,
        periodicScanDuration: scanDuration,
        presenceHeartbeatInterval: heartbeat,
        collectAdvertisingId: collectAdvertisingId,
        collectLocation: collectLocation,
        collectWifi: collectWifi,
        adaptiveSamplingEnabled: adaptiveSampling,
        collectMotionSensors: collectMotionSensors
      )
      self.sdk.delegate = self
      self.configured = true
      UserDefaults.standard.set(signature, forKey: Self.configSignatureKey)

      if restart { self.sdk.startScanning() }
    }
  }

  private static let configSignatureKey = "io.bearound.cordova.configSignature"

  /// FNV-1a. Stable across launches (Swift's own hashing is seeded per process) and keeps
  /// the business token out of the stored value.
  private static func stableHash(_ text: String) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in text.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01b3
    }
    return String(hash, radix: 16)
  }

  func startScanning() {
    DispatchQueue.main.async {
      self.sdk.delegate = self
      self.sdk.startScanning()
    }
  }

  func stopScanning() {
    DispatchQueue.main.async { self.sdk.stopScanning() }
  }

  func isScanning() -> Bool {
    mainThreadSync { self.sdk.isScanning }
  }

  func setUserProperties(_ properties: [String: Any]) {
    var custom: [String: String] = [:]
    (properties["customProperties"] as? [String: Any] ?? [:]).forEach { key, value in
      if let string = value as? String { custom[key] = string }
    }
    let userProperties = UserProperties(
      internalId: properties["internalId"] as? String,
      email: properties["email"] as? String,
      name: properties["name"] as? String,
      customProperties: custom
    )
    DispatchQueue.main.async { self.sdk.setUserProperties(userProperties) }
  }

  func clearUserProperties() {
    DispatchQueue.main.async { self.sdk.clearUserProperties() }
  }

  // MARK: - Push

  func setPushToken(_ token: String) {
    DispatchQueue.main.async { self.sdk.setPushToken(token) }
  }

  /// Silent-push wake-up. The launch hook already handles the `bearound` silent push on
  /// the app delegate, so this exists for hosts whose push plugin owns the delegate and
  /// hands the payload to JavaScript: a Bearound payload triggers the same background BLE
  /// refresh and sync, anything else is ignored.
  func handleRemoteMessage(_ data: [String: Any]) -> Bool {
    guard data["bearound"] != nil else { return false }
    // Reports receipt for measurable sends; a no-op otherwise.
    sdk.trackNotificationReceived(userInfo: data)
    DispatchQueue.main.async {
      self.sdk.performBackgroundBLERefreshAndSync(bleScanDuration: 10, trigger: "silent_push") { _ in }
    }
    return true
  }

  func trackNotificationOpened(_ data: [String: Any]) {
    sdk.trackNotificationOpened(userInfo: data)
  }

  func setErrorReportingEnabled(_ enabled: Bool) {
    DispatchQueue.main.async { self.sdk.setErrorReportingEnabled(enabled) }
  }

  /// What this install can detect right now, as the SDK itself evaluates it from the
  /// permissions and background modes: `full`, `backgroundBle`, `foregroundOnly` or `blind`.
  func detectionReadiness() -> String {
    mainThreadSync { self.sdk.detectionReadiness.rawValue }
  }

  // MARK: - State and diagnostics

  func currentScanPrecision() -> String {
    mainThreadSync { self.sdk.currentScanPrecision?.rawValue ?? "" }
  }

  func bleDiagnosticInfo() -> String {
    mainThreadSync { self.sdk.bleDiagnosticInfo }
  }

  func pendingBatchCount() -> Int {
    mainThreadSync { self.sdk.pendingBatchCount }
  }

  /// Batches that failed to upload and are waiting for retry, oldest first.
  func pendingBatches() -> [[[String: Any]]] {
    mainThreadSync { self.sdk.pendingBatches.map { batch in batch.map { self.mapBeacon($0) } } }
  }

  func persistedLog() -> String {
    mainThreadSync { self.sdk.getDetectionLogJson() }
  }

  func clearPersistedLog() {
    DispatchQueue.main.async { self.sdk.clearDetectionLog() }
  }

  func authorizationStatus() -> String {
    switch BeAroundSDK.authorizationStatus() {
    case .authorizedAlways: return "always"
    case .authorizedWhenInUse: return "whenInUse"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
  }

  func requestLocationAuthorization(_ level: String) {
    let mapped: BeAroundLocationAuthorization = level.lowercased() == "wheninuse" ? .whenInUse : .always
    DispatchQueue.main.async { self.sdk.requestLocationAuthorization(mapped) }
  }

  /// Main queue and app-active are both required: iOS silently ignores the prompt otherwise.
  func requestTrackingAuthorization(_ completion: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      self.sdk.requestTrackingAuthorization { status in completion(status) }
    }
  }

  // MARK: - Bluetooth state

  func currentBluetoothState() -> String {
    ensureBluetoothManager()
    return mainThreadSync { self.bluetoothState }
  }

  func ensureBluetoothManager() {
    if bluetoothManager != nil { return }
    // Creating a CBCentralManager before the user has decided on Bluetooth access raises
    // the system prompt; wait for the app to ask through the permission API.
    if #available(iOS 13.1, *), CBCentralManager.authorization == .notDetermined { return }
    mainThreadSync {
      self.bluetoothManager = CBCentralManager(
        delegate: self,
        queue: nil,
        options: [CBCentralManagerOptionShowPowerAlertKey: false]
      )
    }
  }

  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    bluetoothState = mapBluetoothState(central.state)
    emit("bluetoothState", ["state": bluetoothState])
  }

  private func mapBluetoothState(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "poweredOn"
    case .poweredOff: return "poweredOff"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    case .resetting: return "resetting"
    case .unknown: return "unknown"
    @unknown default: return "unknown"
    }
  }

  // MARK: - Permissions

  func permissionStatus(_ completion: @escaping ([String: Any]) -> Void) {
    let location = currentAuthorizationStatus()
    let locationGranted = location == .authorizedAlways || location == .authorizedWhenInUse
    var bluetoothGranted = true
    if #available(iOS 13.1, *) {
      bluetoothGranted = CBCentralManager.authorization == .allowedAlways
    }
    // With reduced accuracy iOS disables the beacon APIs of Core Location altogether.
    var preciseLocation = locationGranted
    if #available(iOS 14.0, *), locationGranted {
      preciseLocation = CLLocationManager().accuracyAuthorization == .fullAccuracy
    }
    notificationPermission { notifications in
      completion([
        "fineLocation": locationGranted,
        "preciseLocation": preciseLocation,
        "btScan": bluetoothGranted,
        "btConnect": bluetoothGranted,
        "btAdvertise": bluetoothGranted,
        "notifications": notifications,
        "backgroundLocation": location == .authorizedAlways,
      ])
    }
  }

  func notificationPermission(_ completion: @escaping (Bool) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      var granted = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
      if #available(iOS 14.0, *), settings.authorizationStatus == .ephemeral { granted = true }
      completion(granted)
    }
  }

  func requestNotificationPermission(_ completion: @escaping (Bool) -> Void) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
      completion(granted)
    }
  }

  /// Asks for location ("Always") when it is still undetermined; resolves with the result.
  func requestLocationPermission(_ completion: @escaping (Bool) -> Void) {
    DispatchQueue.main.async {
      guard CLLocationManager.locationServicesEnabled() else {
        completion(false)
        return
      }
      let status = self.currentAuthorizationStatus()
      if status == .authorizedAlways || status == .authorizedWhenInUse {
        completion(true)
        return
      }
      guard status == .notDetermined, self.permissionCompletion == nil else {
        completion(false)
        return
      }
      self.permissionCompletion = completion
      let manager = CLLocationManager()
      self.permissionManager = manager
      manager.delegate = self
      manager.requestAlwaysAuthorization()
    }
  }

  @available(iOS 14.0, *)
  public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    handleAuthorizationChange(manager.authorizationStatus)
  }

  public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    handleAuthorizationChange(status)
  }

  private func handleAuthorizationChange(_ status: CLAuthorizationStatus) {
    guard status != .notDetermined else { return }
    let granted = status == .authorizedAlways || status == .authorizedWhenInUse
    permissionCompletion?(granted)
    permissionCompletion = nil
    permissionManager?.delegate = nil
    permissionManager = nil
  }

  private func currentAuthorizationStatus() -> CLAuthorizationStatus {
    BeAroundSDK.authorizationStatus()
  }

  // MARK: - BeAroundSDKDelegate

  public func didUpdateBeacons(_ beacons: [Beacon]) {
    if !beacons.isEmpty {
      debugNotify(id: "detect", title: "Beacon Detectado",
                  body: "Encontrado \(beacons.count) beacon\(plural(beacons.count)) próximo\(plural(beacons.count))",
                  cooldown: 300)
    }
    emit("beacons", ["beacons": beacons.map { mapBeacon($0) }])
  }

  public func didFailWithError(_ error: Error) {
    emit("error", ["message": error.localizedDescription])
  }

  public func didChangeScanning(isScanning: Bool) {
    debugNotify(id: isScanning ? "scan-start" : "scan-stop",
                title: isScanning ? "Escaneamento Iniciado" : "Escaneamento Parado",
                body: isScanning ? "BeAroundSDK está escaneando beacons" : "BeAroundSDK parou de escanear",
                cooldown: 10)
    emit("scanning", ["isScanning": isScanning])
  }

  public func willStartSync(beaconCount: Int) {
    debugNotify(id: "sync-start", title: "Sincronizando",
                body: syncBody(started: true, beaconCount: beaconCount), cooldown: 30, sound: false)
    emit("syncLifecycle", ["type": "started", "beaconCount": beaconCount])
  }

  public func didCompleteSync(beaconCount: Int, success: Bool, error: Error?) {
    debugNotify(id: success ? "sync-ok" : "sync-fail",
                title: success ? "Sync Completo" : "Sync Falhou",
                body: success ? syncBody(started: false, beaconCount: beaconCount)
                              : (error?.localizedDescription ?? "erro desconhecido"),
                cooldown: success ? 10 : 30, sound: !success)
    var payload: [String: Any] = ["type": "completed", "beaconCount": beaconCount, "success": success]
    if let error = error { payload["error"] = error.localizedDescription }
    emit("syncLifecycle", payload)
  }

  // The JS event keeps the {beaconCount} shape for parity with Android.
  public func didDetectBeaconInBackground(beacons: [Beacon]) {
    debugNotify(id: "bg-detect", title: "Beacon Detectado (Background)",
                body: "Encontrado \(beacons.count) beacon\(plural(beacons.count)) próximo\(plural(beacons.count))",
                cooldown: 60)
    emit("backgroundDetection", ["beaconCount": beacons.count])
  }

  // The copy does not promise a beacon on purpose: two devices running the SDK near each
  // other also trigger a zone entry, so a zone with zero beacons is correct.
  public func didEnterBeaconRegion() {
    debugNotify(id: "zone-enter", title: "Entrou na zona",
                body: "Sinal Bearound por perto: beacon ou outro aparelho com o SDK (Location)", cooldown: 5)
    emit("beaconRegion", ["type": "enter"])
  }

  public func didExitBeaconRegion() {
    debugNotify(id: "zone-exit", title: "Saiu da zona",
                body: "Sem sinal Bearound por perto (nem beacon, nem aparelho) (Location)", cooldown: 5)
    emit("beaconRegion", ["type": "exit"])
  }

  public func didChangeActiveScanState(isActive: Bool) {
    emit("activeScan", ["isActive": isActive])
  }

  public func didEnterBluetoothZone() {
    debugNotify(id: "zone-enter", title: "Entrou na zona",
                body: "Sinal Bearound por perto: beacon ou outro aparelho com o SDK (Bluetooth)", cooldown: 5)
    emit("bluetoothZone", ["type": "enter"])
  }

  public func didExitBluetoothZone() {
    debugNotify(id: "zone-exit", title: "Saiu da zona",
                body: "Sem sinal Bearound por perto (nem beacon, nem aparelho) (Bluetooth)", cooldown: 5)
    emit("bluetoothZone", ["type": "exit"])
  }

  public func didChangeBluetoothScanMode(_ mode: BluetoothScanMode, nextIdleScanAt: Date?) {
    var payload: [String: Any] = ["mode": mode.rawValue]
    if let nextIdleScanAt = nextIdleScanAt {
      payload["nextIdleScanAt"] = Int(nextIdleScanAt.timeIntervalSince1970 * 1000)
    }
    emit("bluetoothScanMode", payload)
  }

  /// Result of the scan the SDK ran after handling a Bearound silent push.
  public func didCompletePushScan(beaconsFound: Int, ingestStarted: Bool, pendingBatches: Int) {
    let title = ingestStarted ? "Push → Scan ✅ · enviando" : "Push → Scan ✅ · nada a enviar"
    let body: String
    if !ingestStarted {
      body = "Scan: OK · Beacons: 0 · Ingest: nada novo pra enviar."
    } else if beaconsFound > 0 {
      body = "Scan: OK · Beacons: \(beaconsFound) · Ingest: enviando ao servidor…"
    } else {
      body = "Scan: OK · Beacons: 0 · Ingest: reenviando \(pendingBatches) lote(s) pendente(s)…"
    }
    debugNotify(id: "push-scan", title: title, body: body, cooldown: 0)
    emit("pushScan", [
      "beaconsFound": beaconsFound,
      "ingestStarted": ingestStarted,
      "pendingBatches": pendingBatches,
    ])
  }

  // MARK: - Mapping

  private func mapBeacon(_ beacon: Beacon) -> [String: Any] {
    var payload: [String: Any] = [
      "uuid": beacon.uuid.uuidString,
      "major": beacon.major,
      "minor": beacon.minor,
      "rssi": beacon.rssi,
      "proximity": mapProximity(beacon.proximity),
      // Cordova serializes results with NSJSONSerialization, which raises an Objective-C
      // exception (a crash) on NaN or infinity. Never hand it a non-finite number.
      "accuracy": beacon.accuracy.isFinite ? beacon.accuracy : -1,
      "timestamp": Int(beacon.timestamp.timeIntervalSince1970 * 1000),
      "discoverySources": beacon.discoverySources.map { mapDiscoverySource($0) },
      "alreadySynced": beacon.alreadySynced,
    ]
    if let metadata = beacon.metadata { payload["metadata"] = mapMetadata(metadata) }
    if let txPower = beacon.txPower { payload["txPower"] = txPower }
    if let syncedAt = beacon.syncedAt { payload["syncedAt"] = Int(syncedAt.timeIntervalSince1970 * 1000) }
    return payload
  }

  private func mapDiscoverySource(_ source: BeaconDiscoverySource) -> String {
    switch source {
    case .serviceUUID: return "serviceUUID"
    case .name: return "name"
    case .coreLocation: return "coreLocation"
    }
  }

  private func mapProximity(_ proximity: BeaconProximity) -> String {
    switch proximity {
    case .immediate: return "immediate"
    case .near: return "near"
    case .far: return "far"
    case .bt: return "bt"
    case .unknown: return "unknown"
    }
  }

  private func mapMetadata(_ metadata: BeaconMetadata) -> [String: Any] {
    var payload: [String: Any] = [
      "firmwareVersion": metadata.firmwareVersion,
      "batteryLevel": metadata.batteryLevel,
      "movements": metadata.movements,
      "temperature": metadata.temperature,
    ]
    if let txPower = metadata.txPower { payload["txPower"] = txPower }
    if let rssiFromBLE = metadata.rssiFromBLE { payload["rssiFromBLE"] = rssiFromBLE }
    if let isConnectable = metadata.isConnectable { payload["isConnectable"] = isConnectable }
    return payload
  }

  private func mapScanPrecision(_ value: String) -> ScanPrecision {
    switch value.lowercased() {
    case "medium": return .medium
    case "low": return .low
    default: return .high
    }
  }

  private func mapMaxQueuedPayloads(_ value: Int) -> MaxQueuedPayloads {
    switch value {
    case 50: return .small
    case 200: return .large
    case 500: return .xlarge
    default: return .medium
    }
  }

  private func number(_ value: Any?, _ fallback: Double) -> NSNumber {
    (value as? NSNumber) ?? NSNumber(value: fallback)
  }

  private func bool(_ value: Any?, _ fallback: Bool) -> Bool {
    (value as? NSNumber)?.boolValue ?? fallback
  }

  @discardableResult
  private func mainThreadSync<T>(_ work: () -> T) -> T {
    if Thread.isMainThread { return work() }
    var result: T!
    DispatchQueue.main.sync { result = work() }
    return result
  }
}
