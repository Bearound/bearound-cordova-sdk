# Parity with the React Native and Flutter packages

Reference versions: `@bearound/react-native-sdk` 3.18.1 and `bearound_flutter_sdk` 3.18.0,
both on native SDK 3.18.0 (Android and iOS). This plugin targets native Android 3.18.1 and
native iOS 3.18.0.

Legend: **Same** means the same name, arguments and result as the React Native package.
Every difference is written out; nothing is left out without an entry here.

## Methods

| Method | Cordova | Android | iOS | Notes |
| --- | --- | --- | --- | --- |
| `configure` | Same | Yes | Yes | Reports `technology = "cordova"`. Stops and restarts a running scan only when the configuration changed; React Native and Flutter do it on every call, which switches the scanner off on each launch. |
| `startScanning` | Same | Yes | Yes | |
| `stopScanning` | Same | Yes | Yes | |
| `isScanning` | Same | Yes | Yes | |
| `setUserProperties` | Same | Yes | Yes | |
| `clearUserProperties` | Same | Yes | Yes | |
| `setPushToken` | Same | Yes | Yes | Rejects an empty token with `INVALID_ARGUMENT` (React Native forwards it). |
| `handleRemoteMessage` | Same | Yes | Yes | Usually not needed in Cordova: see "Push delivery" below. |
| `trackNotificationOpened` | Same | Yes | Yes | |
| `checkPermissions` | Same | Yes | Yes | On iOS the Bluetooth fields reflect the real Bluetooth authorization (React Native mirrors the location status). Adds `preciseLocation`. |
| `requestForegroundPermissions` | Same | Yes | Yes | Prompts natively. Android also asks for `BLUETOOTH_ADVERTISE` and `POST_NOTIFICATIONS`. |
| `requestBackgroundLocation` | Same | Yes | Yes | Android rejects with `PERMISSION_NOT_DECLARED` when the manifest lacks the permission. |
| `ensurePermissions` | Same | Yes | Yes | |
| `requestNotificationPermission` | **Cordova only** | Yes | Yes | React Native and Flutter leave this prompt to a separate library. |
| `checkNotificationPermission` | Same | Yes | Yes | Public here; internal in React Native. |
| `getSdkVersion` | Same | Yes | Yes | |
| `getCurrentScanPrecision` | Same | Yes | Yes | |
| `getBleDiagnosticInfo` | Same | `''` | Yes | iOS only in every package. |
| `getPendingBatchCount` | Same | Yes | Yes | |
| `getPendingBatches` | **Cordova only** | Yes | Yes | The native `pendingBatches`, used by the retry queue screen of the native examples. |
| `setDebugNotificationsEnabled` | Same as Flutter | Yes | Yes | Flutter implements it on iOS only; here both platforms post the native example's notifications. |
| `isDebugNotificationsEnabled` | **Cordova only** | Yes | Yes | |
| `isConfigured` | Same | Yes | Yes | |
| `isLocationAvailable` | Same | Yes | Yes | |
| `getAuthorizationStatus` | Same | Yes | Yes | Android returns its own permission-status string. |
| `getBluetoothState` | Same | Yes | Yes | iOS reports `unknown` until Bluetooth access has been decided, to avoid raising the system prompt just to read the state. |
| `getPersistedLog` | Same | Yes | Yes | |
| `clearPersistedLog` | Same | Yes | Yes | |
| `requestLocationAuthorization` | Same | No-op | Yes | iOS only in every package. |
| `requestTrackingAuthorization` | Same | `'unavailable'` | Yes | iOS only in every package. |
| `getTrackingAuthorizationStatus` | Same | `'unavailable'` | Yes | iOS only in every package. |
| `enableForegroundScanning` | Same | Yes | No-op | Android only in every package. |
| `disableForegroundScanning` | Same | Yes | No-op | Android only in every package. |
| `isForegroundScanningEnabled` | Same | Yes | `false` | Android only in every package. |
| `setForegroundNotificationContent` | Same | Yes | No-op | Android only in every package. |
| `isIgnoringBatteryOptimizations` | Same | Yes | `true` | Android only in every package. |
| `openBatteryOptimizationSettings` | Same | Yes | `false` | Android only in every package. |
| `isAutostartManageable` | Same | Yes | `false` | Android only in every package. |
| `openManufacturerAutostartSettings` | Same | Yes | `false` | Android only in every package. |
| `setErrorReportingEnabled` | Same name | Yes | Yes | Controls the native SDK's error telemetry. The JavaScript-layer reporter of the React Native package is not included, so there is nothing else to switch off. |
| `getDetectionReadiness` | Same as Flutter | `'unknown'` | Yes | iOS only in every package. |
| `setBluetoothScanning` | **Not available** | | | Flutter-only QA aid for its example app. |

## Configuration

| Option | Cordova | Notes |
| --- | --- | --- |
| `businessToken` | Same | |
| `scanPrecision` | Same | Default `'high'`. |
| `maxQueuedPayloads` | Same | Default `100`. |
| `periodicReconciliationEnabled` | Same | |
| `periodicReconciliationIntervalMs` | Same | Clamped by the native SDKs. |
| `periodicScanDurationMs` | Same | Clamped by the native SDKs. |
| `presenceHeartbeatIntervalMs` | Same | Clamped by the native SDKs. |
| `collectAdvertisingId` | Same | |
| `collectLocation` | Same | |
| `collectWifi` | Same | |
| `requestTrackingOnStart` | **Not available** | Deprecated and ignored in React Native; dropped here. |
| `adaptiveSamplingEnabled` | **Cordova only** | Native option, not exposed by React Native or Flutter. |
| `collectMotionSensors` | **Cordova only** | Native option, not exposed by React Native or Flutter. |

## Events

| Event | Cordova listener | Android | iOS | Notes |
| --- | --- | --- | --- | --- |
| Beacons | `addBeaconsListener` | Yes | Yes | Same payload, including the platform-specific fields. |
| Scanning state | `addScanningListener` | Yes | Yes | |
| Sync lifecycle | `addSyncLifecycleListener` | Yes | Yes | |
| Background detection | `addBackgroundDetectionListener` | Yes | Yes | |
| Beacon region | `addBeaconRegionListener` | Yes | Yes | |
| Active scan | `addActiveScanListener` | Yes | Yes | |
| Bluetooth state | `addBluetoothStateListener` | Yes | Yes | |
| Error | `addErrorListener` | Yes | Yes | |
| Bluetooth zone | `addBluetoothZoneListener` | Never fires | Yes | iOS only in every package. |
| Bluetooth scan mode | `addBluetoothScanModeListener` | Never fires | Yes | iOS only in every package. |
| Push-triggered scan result | `addPushScanListener` | Never fires | Yes | **Cordova only.** The native iOS delegate callback; React Native and Flutter do not forward it. |

Differences in delivery:

- A listener returns `{ remove() }`, like the React Native `EmitterSubscription`.
- Events emitted while no page is subscribed are buffered natively (the latest 50) and
  delivered on subscription. React Native and Flutter drop them.

## Native API not bridged

These exist in the native SDKs and are not exposed by this plugin (nor by React Native
or Flutter):

| Native | Platform | Why |
| --- | --- | --- |
| `diagnostics()` | Both | Internal snapshot whose shape differs per platform. `getBleDiagnosticInfo` and `getPersistedLog` cover field diagnosis. |
| `reliabilityStatus()` | Android | Its useful parts are exposed one by one (`isIgnoringBatteryOptimizations`, `isAutostartManageable`). |
| `isInBeaconRegion`, `currentSyncInterval`, `deviceId` | Android | No iOS counterpart; region state arrives through `addBeaconRegionListener`. |
| `performBackgroundSync`, `performBackgroundFetch`, `handleBackgroundURLSessionEvents` | iOS | Called by the plugin's launch wiring; an app has no reason to call them. |

## Platform integration

| Topic | React Native / Flutter | Cordova |
| --- | --- | --- |
| iOS launch wiring (delegate, background tasks, remote notification registration) | Written by hand in `AppDelegate`, or by the Expo config plugin | Automatic: the plugin hooks app launch natively. |
| iOS background fetch and background upload completion | Written by hand in `AppDelegate` | Automatic, wrapping the host's implementation when present. |
| iOS background modes, task identifiers, usage descriptions | By hand, or by the Expo config plugin | Added by `plugin.xml`. |
| iOS `aps-environment` entitlement | By hand, or by the Expo config plugin | Added by `plugin.xml` (development in debug, production in release). |
| iOS Access Wi-Fi Information entitlement | Expo config plugin adds it by default | Added by `plugin.xml`. |
| Android process-start wiring (SDK listener before any page loads) | The app's own `Application` class, when it writes one | Automatic: a provider registered by the plugin. |
| iOS `NSUserTrackingUsageDescription` | Expo config plugin prop | **Not added.** Declare it in `config.xml` to use the advertising identifier. |
| Android permissions | Declared by the native SDK | Same. |
| Android runtime permission prompts | JavaScript (`PermissionsAndroid`, `permission_handler`) | Native, through the Cordova permission API. |
| Android `ACCESS_BACKGROUND_LOCATION` | Expo plugin option `backgroundWifi` | **Not added.** Declare it in `config.xml` if you need it. |

## Push delivery

| Topic | React Native / Flutter | Cordova |
| --- | --- | --- |
| Android FCM token | Auto-collected when Firebase is present | Same, plus the plugin's messaging service forwards every refresh. |
| Android silent push and rich push with the app closed | A headless JavaScript handler forwards the message | Handled natively by the plugin's `FirebaseMessagingService`. Cordova has no JavaScript running in a closed app. |
| Android coexistence with another push library | The app's own handler forwards to the SDK | The plugin's service forwards non-Bearound messages to the other service, or is disabled with `BEAROUND_FCM_SERVICE_ENABLED=false`. |
| Android notification tap | Native lifecycle hook plus `trackNotificationOpened` from the messaging library | Native: launch intent and `onNewIntent`. `trackNotificationOpened` remains available. |
| iOS APNs token, silent push, tap measurement | Hand-written `AppDelegate` methods, with the SDK's own handling as fallback | The SDK's own handling, installed at launch by the plugin. `setPushToken`, `handleRemoteMessage` and `trackNotificationOpened` are the manual fallback. |
| iOS rich push | Two extension targets added by hand | Two extension targets in the app project. Not done by the plugin; the example ships a Cordova hook that adds them. |
