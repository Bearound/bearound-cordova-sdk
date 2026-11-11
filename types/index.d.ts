// Type definitions for @bearound/cordova-plugin.
// The API is exposed at runtime as `cordova.plugins.Bearound` after `deviceready`.

export type ScanPrecisionValue = 'high' | 'medium' | 'low';
export type MaxQueuedPayloadsValue = 50 | 100 | 200 | 500;

export interface SdkConfig {
  businessToken: string;
  /** Default: `'high'`. */
  scanPrecision?: ScanPrecisionValue;
  /** Default: `100`. */
  maxQueuedPayloads?: MaxQueuedPayloadsValue;
  /**
   * Periodic background reconciliation (iOS: BGAppRefreshTask; Android: WorkManager).
   * Best effort: the OS decides when, and whether, it runs. Default: `true`.
   */
  periodicReconciliationEnabled?: boolean;
  /**
   * Minimum interval requested between eligible executions, in milliseconds. A floor,
   * never a guaranteed cadence. Default: 20 min. The native SDKs clamp out-of-range
   * values (floor 10 min on iOS, 15 min on Android; ceiling 24 h).
   */
  periodicReconciliationIntervalMs?: number;
  /** Ceiling of the collection window inside the periodic task, in ms. Default: 12 s. */
  periodicScanDurationMs?: number;
  /**
   * How often a scan that found nothing still reports in, in ms. Default: 5 min.
   * Native range 1 min to 1 h; `0` turns the empty-scan report off.
   */
  presenceHeartbeatIntervalMs?: number;
  /** Whether the SDK may read and report the advertising identifier. Default: `true`. */
  collectAdvertisingId?: boolean;
  /** Whether the SDK may report the device's own location. Default: `true`. */
  collectLocation?: boolean;
  /** Whether the SDK may report the Wi-Fi access points around the device. Default: `true`. */
  collectWifi?: boolean;
  /**
   * Whether uploads follow the device's motion (fewer reports while still). Changes the
   * upload cadence, not the readings. Default: `true`.
   */
  adaptiveSamplingEnabled?: boolean;
  /**
   * Whether the SDK may read motion sensors to drive adaptive sampling. When left out it
   * follows `collectLocation` or `collectWifi`; `false` turns every motion source off.
   */
  collectMotionSensors?: boolean;
}

export interface UserProperties {
  internalId?: string;
  email?: string;
  name?: string;
  customProperties?: Record<string, string>;
}

export type BeaconProximity = 'immediate' | 'near' | 'far' | 'bt' | 'unknown';

export interface BeaconMetadata {
  /** Firmware identifier: an integer encoded as a string (for example `"1"`). */
  firmwareVersion: string;
  /** Battery level in millivolts (for example `3269`). */
  batteryLevel: number;
  movements: number;
  temperature: number;
  txPower?: number;
  rssiFromBLE?: number;
  isConnectable?: boolean;
}

/** iOS-only. Which detector saw the beacon. */
export type BeaconDiscoverySource = 'serviceUUID' | 'name' | 'coreLocation';

/** Android-only. Aggregated RSSI statistics over a sync window. */
export interface RssiStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  firstSeen: number;
  lastSeen: number;
}

export interface Beacon {
  uuid: string;
  major: number;
  minor: number;
  rssi: number;
  proximity: BeaconProximity;
  accuracy: number;
  /** Epoch milliseconds. */
  timestamp: number;
  metadata?: BeaconMetadata;
  txPower?: number;
  alreadySynced?: boolean;
  /** Epoch milliseconds of the last successful sync for this beacon. */
  syncedAt?: number;
  /** iOS-only. */
  discoverySources?: BeaconDiscoverySource[];
  /** Android-only. */
  rssiRaw?: number;
  /** Android-only. */
  rssiSamples?: RssiStats;
  /** Android-only. */
  isStale?: boolean;
}

export interface SyncLifecycleEvent {
  type: 'started' | 'completed';
  beaconCount: number;
  success?: boolean;
  error?: string;
}

export interface BackgroundDetectionEvent {
  beaconCount: number;
}

export interface BearoundErrorEvent {
  message: string;
}

export interface BeaconRegionEvent {
  type: 'enter' | 'exit';
}

export interface ActiveScanEvent {
  isActive: boolean;
}

/** iOS-only. */
export interface BluetoothZoneEvent {
  type: 'enter' | 'exit';
}

/** iOS-only. */
export interface BluetoothScanModeEvent {
  mode: 'idle' | 'active';
  /** Epoch milliseconds of the next idle peek. Present only when `mode === 'idle'`. */
  nextIdleScanAt?: number;
}

/** iOS-only. Result of the scan the SDK ran after a Bearound silent push. */
export interface PushScanEvent {
  beaconsFound: number;
  ingestStarted: boolean;
  pendingBatches: number;
}

export type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'resetting'
  | 'unknown';

export interface PermissionResult {
  fineLocation: boolean;
  /**
   * iOS: location is authorized with full accuracy. With reduced accuracy iOS turns the
   * Core Location beacon APIs off. Android: same as `fineLocation`.
   */
  preciseLocation: boolean;
  btScan: boolean;
  btConnect: boolean;
  btAdvertise: boolean;
  notifications: boolean;
  backgroundLocation: boolean;
}

export type AuthorizationStatus =
  | 'always'
  | 'whenInUse'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'unknown'
  | string;

/** `unavailable` on Android (no such concept) and on iOS below 14. */
export type TrackingAuthorizationStatus =
  | 'authorized'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'unavailable';

/**
 * What this install can detect right now, evaluated by the iOS SDK from the permissions
 * and background modes. `full`: the app is woken on beacon entry. `backgroundBle`: no
 * location waker, Bluetooth still scans in the background. `foregroundOnly`: detection
 * only with the app open. `blind`: nothing can run. Android resolves `unknown`.
 */
export type DetectionReadiness = 'full' | 'backgroundBle' | 'foregroundOnly' | 'blind' | 'unknown';

export type PersistedLogState = 'foreground' | 'background' | 'backgroundLocked' | 'terminated';

export interface PersistedLogEntry {
  id: string;
  timestamp: number;
  state: PersistedLogState;
  type: string;
  detail: string;
}

/** Android-only. Foreground-service notification shown while scanning in background. */
export interface ForegroundScanConfig {
  notificationTitle?: string;
  notificationText?: string;
  notificationChannelId?: string;
  notificationChannelName?: string;
}

export interface NotificationContent {
  title: string;
  text: string;
}

export interface Subscription {
  remove(): void;
}

/** Rejections carry a stable `code` next to the message. */
export interface BearoundError extends Error {
  code: string;
}

export interface BearoundPlugin {
  readonly ScanPrecision: { readonly HIGH: 'high'; readonly MEDIUM: 'medium'; readonly LOW: 'low' };
  readonly MaxQueuedPayloads: {
    readonly SMALL: 50;
    readonly MEDIUM: 100;
    readonly LARGE: 200;
    readonly XLARGE: 500;
  };

  configure(config: SdkConfig): Promise<void>;
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  isScanning(): Promise<boolean>;
  setUserProperties(properties: UserProperties): Promise<void>;
  clearUserProperties(): Promise<void>;

  /**
   * Forwards a push token to the native SDK. Android: the FCM token. iOS: the raw APNs
   * device token (hex), never the FCM token. Usually not needed: both platforms capture
   * the token natively.
   */
  setPushToken(token: string): Promise<void>;
  /**
   * Hands a push payload received in JavaScript to the native SDK. Resolves `true` when
   * it was a Bearound message. Only needed when another push plugin owns the delivery.
   */
  handleRemoteMessage(data: Record<string, unknown>): Promise<boolean>;
  /** Reports a notification tap. Usually not needed: taps are detected natively. */
  trackNotificationOpened(data: Record<string, unknown>): Promise<void>;

  /**
   * Turns the native SDK's own error telemetry on or off. Default: on. Opting out stops
   * the SDK from reporting its internal errors.
   */
  setErrorReportingEnabled(enabled: boolean): Promise<void>;
  /** iOS; Android resolves `'unknown'`. */
  getDetectionReadiness(): Promise<DetectionReadiness>;

  /**
   * QA aid, off by default and persisted. Posts a local notification for each SDK event
   * (zone enter and exit, scan, detection, sync, push-triggered scan), with the texts of
   * the native example apps, so background runs can be followed on the lock screen. On
   * iOS it also takes over the notification center delegate to show banners in foreground.
   */
  setDebugNotificationsEnabled(enabled: boolean): Promise<void>;
  isDebugNotificationsEnabled(): Promise<boolean>;

  checkPermissions(): Promise<PermissionResult>;
  /** Location, Bluetooth and (Android 13+) notification prompts, as applicable. */
  requestForegroundPermissions(): Promise<PermissionResult>;
  requestBackgroundLocation(): Promise<boolean>;
  requestNotificationPermission(): Promise<boolean>;
  checkNotificationPermission(): Promise<boolean>;
  ensurePermissions(options?: { askBackground?: boolean }): Promise<PermissionResult>;

  getSdkVersion(): Promise<string>;
  getCurrentScanPrecision(): Promise<string>;
  /** iOS-only; Android resolves `''`. */
  getBleDiagnosticInfo(): Promise<string>;
  getPendingBatchCount(): Promise<number>;
  /** Batches that failed to upload and are waiting for retry, oldest first. */
  getPendingBatches(): Promise<Beacon[][]>;
  isConfigured(): Promise<boolean>;
  isLocationAvailable(): Promise<boolean>;
  getAuthorizationStatus(): Promise<AuthorizationStatus>;
  getBluetoothState(): Promise<BluetoothState>;
  getPersistedLog(): Promise<PersistedLogEntry[]>;
  clearPersistedLog(): Promise<void>;
  /** iOS-only; no-op on Android. */
  requestLocationAuthorization(level?: 'always' | 'whenInUse'): Promise<void>;
  /** iOS-only; Android resolves `'unavailable'`. */
  requestTrackingAuthorization(): Promise<TrackingAuthorizationStatus>;
  getTrackingAuthorizationStatus(): Promise<TrackingAuthorizationStatus>;

  /** Android-only; no-op on iOS. */
  enableForegroundScanning(config?: ForegroundScanConfig): Promise<void>;
  /** Android-only; no-op on iOS. */
  disableForegroundScanning(): Promise<void>;
  /** Android-only; iOS resolves `false`. */
  isForegroundScanningEnabled(): Promise<boolean>;
  /** Android-only; no-op on iOS. */
  setForegroundNotificationContent(content: NotificationContent): Promise<void>;

  /** Android-only; iOS resolves `true`. */
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  /** Android-only; iOS resolves `false`. */
  openBatteryOptimizationSettings(): Promise<boolean>;
  /** Android-only; iOS resolves `false`. */
  isAutostartManageable(): Promise<boolean>;
  /** Android-only; iOS resolves `false`. */
  openManufacturerAutostartSettings(): Promise<boolean>;

  addBeaconsListener(listener: (beacons: Beacon[]) => void): Subscription;
  addSyncLifecycleListener(listener: (event: SyncLifecycleEvent) => void): Subscription;
  addBackgroundDetectionListener(listener: (event: BackgroundDetectionEvent) => void): Subscription;
  addScanningListener(listener: (isScanning: boolean) => void): Subscription;
  addErrorListener(listener: (error: BearoundErrorEvent) => void): Subscription;
  addBeaconRegionListener(listener: (event: BeaconRegionEvent) => void): Subscription;
  addActiveScanListener(listener: (event: ActiveScanEvent) => void): Subscription;
  /** iOS-only; never fires on Android. */
  addBluetoothZoneListener(listener: (event: BluetoothZoneEvent) => void): Subscription;
  /** iOS-only; never fires on Android. */
  addBluetoothScanModeListener(listener: (event: BluetoothScanModeEvent) => void): Subscription;
  addBluetoothStateListener(listener: (state: BluetoothState) => void): Subscription;
  /** iOS-only; never fires on Android. */
  addPushScanListener(listener: (event: PushScanEvent) => void): Subscription;
}

declare global {
  interface CordovaPlugins {
    Bearound: BearoundPlugin;
  }
}

declare const Bearound: BearoundPlugin;
export default Bearound;
