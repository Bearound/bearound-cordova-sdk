# 🐻 Bearound Cordova Plugin

Official plugin to integrate **Bearound's** secure BLE beacon detection into **Apache Cordova** apps (Android and iOS).
Built on the Bearound native SDKs: Android **3.18.0** · iOS **3.18.0** (exact pins live in `src/android/bearound.gradle` and `plugin.xml`).

> ✅ Promise-based JavaScript API with TypeScript types. Detection, background sync and push run natively, so they keep working when no web page is loaded.

> [!TIP]
> **⚡ Set it up with an AI agent.** Hand [one prompt](./AI-AGENT-SETUP.md) to your AI coding agent (Claude Code, Cursor, Copilot) and let it pilot the whole install, pausing only for the few human-only steps. → [Set up with an AI agent](#set-up-with-an-ai-agent)

[![Agent setup prompt](https://img.shields.io/badge/Agent_setup_prompt-open_%26_copy-2563eb?style=for-the-badge)](./AI-AGENT-SETUP.md)

The plugin is a thin bridge. Detection, sync, background behavior and push handling are
done by the native Bearound SDKs, the same ones behind the
[React Native](https://github.com/Bearound/bearound-react-native-sdk) and
[Flutter](https://github.com/Bearound/bearound-flutter-sdk) packages. Method names,
configuration and events match those packages; the differences are listed in
[docs/PARITY.md](docs/PARITY.md).

---

## Table of Contents

* [Features](#features)
* [Requirements](#requirements)
* [Installation](#installation)
  * [Android](#android)
  * [iOS](#ios)
  * [Plugin variables](#plugin-variables)
* [Set up with an AI agent](#set-up-with-an-ai-agent)
* [Quick Start](#quick-start)
* [Permissions](#permissions)
* [Background behavior](#background-behavior)
* [Push notifications](#push-notifications)
* [API](#api)
  * [Core](#core)
  * [Push](#push)
  * [Error telemetry and readiness](#error-telemetry-and-readiness)
  * [Debug notifications](#debug-notifications)
  * [State and diagnostics](#state-and-diagnostics)
  * [Android only](#android-only)
* [Events](#events)
* [Errors](#errors)
* [Example app](#example-app)
* [Troubleshooting](#troubleshooting)
* [Limitations](#limitations)
* [License](#license)

---

## Features

- Native beacon scanning on Android and iOS, in foreground, background and after the OS
  relaunches a terminated app
- Real-time beacon events with metadata (battery, firmware, temperature)
- Sync lifecycle, background detection, region and Bluetooth state events, buffered while
  no page is listening
- Push handled natively with the app closed: token capture, silent-push wake-up, rich
  notifications and receipt/tap measurement
- Launch wiring with no native code to edit: no `AppDelegate` or `Application` changes
- Native permission prompts that never appear on their own
- Optional Android foreground service for resilient background scanning
- User properties to enrich beacon events
- TypeScript definitions included

---

## Requirements

| Component | Version |
| --- | --- |
| Cordova CLI | 12 or newer (tested with 13.0.0) |
| cordova-android | 14 or newer (tested with 15.1.0, compile SDK 36) |
| cordova-ios | 8 or newer (tested with 8.2.0) |
| Android | minSdk 24 (cordova-android default; the native SDK supports 23) |
| iOS | 13.0 or newer; 15.0 or newer when building with Xcode 27 |
| Node.js | 20.17 or newer |
| Native Bearound SDK | Android 3.18.0 (JitPack), iOS 3.18.0 (CocoaPods) |

The Android bridge is written in Kotlin and the iOS bridge in Swift. CocoaPods must be
installed for iOS builds.

## Installation

```bash
cordova plugin add @bearound/cordova-plugin
```

To install straight from the repository instead of npm:
`cordova plugin add https://github.com/Bearound/bearound-cordova-sdk.git#<tag or commit>`.

### Android

Add to the `android` platform section of your `config.xml`:

```xml
<platform name="android">
    <preference name="GradlePluginKotlinEnabled" value="true" />
    <preference name="AndroidXEnabled" value="true" />
</platform>
```

Nothing else is required for detection. The native SDK declares its permissions and
components, and the manifest merger adds them to your app.

For push, your app needs Firebase Cloud Messaging: add `google-services.json` and enable
the Google Services Gradle plugin. See [Push notifications](#push-notifications).

### iOS

The plugin adds to your app, on install:

- `UIBackgroundModes`: `bluetooth-central`, `fetch`, `location`, `processing`,
  `remote-notification`
- `BGTaskSchedulerPermittedIdentifiers`: `io.bearound.sdk.sync`,
  `io.bearound.sdk.processing`
- the Bluetooth and location usage descriptions
- the `aps-environment` entitlement (`development` in debug, `production` in release)
- the Access Wi-Fi Information entitlement (`com.apple.developer.networking.wifi-info`),
  without which iOS hides the connected access point

Set the permission texts your users will read. Apple reviews the wording against what the
app does, so replace the generic defaults:

```bash
cordova plugin add @bearound/cordova-plugin \
  --variable BEAROUND_BLUETOOTH_USAGE_DESCRIPTION="..." \
  --variable BEAROUND_LOCATION_WHEN_IN_USE_USAGE_DESCRIPTION="..." \
  --variable BEAROUND_LOCATION_ALWAYS_USAGE_DESCRIPTION="..."
```

Two things the plugin cannot do for you:

- **Capabilities on the App ID.** Push Notifications and Access Wi-Fi Information must
  be enabled for your App ID in the Apple Developer portal (automatic signing does this
  when the entitlements are present). Without Push Notifications APNs issues no token.
- **`NSUserTrackingUsageDescription`.** Add it to your `config.xml` if you want the
  advertising identifier, then call `requestTrackingAuthorization()` at a moment that
  makes sense in your app. The SDK never shows that prompt by itself.

**Xcode 27.** Xcode 27 does not build targets below iOS 15, and the native pod declares
iOS 13. Set `<preference name="deployment-target" value="15.0" />` and pass the build
setting to every target with a `build.json`:

```json
{
  "ios": {
    "debug": { "buildFlag": ["IPHONEOS_DEPLOYMENT_TARGET=15.0"] },
    "release": { "buildFlag": ["IPHONEOS_DEPLOYMENT_TARGET=15.0"] }
  }
}
```

### Plugin variables

| Variable | Platform | Default | Purpose |
| --- | --- | --- | --- |
| `BEAROUND_FCM_SERVICE_ENABLED` | Android | `true` | Registers the plugin's `FirebaseMessagingService`. Set to `false` to forward messages from your own native service. |
| `BEAROUND_FIREBASE_MESSAGING_VERSION` | Android | `24.0.0` | Version of `firebase-messaging` to link against. Match the one your other plugins use. |
| `BEAROUND_BLUETOOTH_USAGE_DESCRIPTION` | iOS | generic text | `NSBluetoothAlwaysUsageDescription` |
| `BEAROUND_LOCATION_WHEN_IN_USE_USAGE_DESCRIPTION` | iOS | generic text | `NSLocationWhenInUseUsageDescription` |
| `BEAROUND_LOCATION_ALWAYS_USAGE_DESCRIPTION` | iOS | generic text | `NSLocationAlwaysAndWhenInUseUsageDescription` |

## Set up with an AI agent

Instead of wiring the integration by hand, hand it to an **AI coding agent** (Claude Code, Cursor, Copilot, …). This README is written to be **agent-readable**: the agent reads it and does the whole integration. There is one ready-made prompt to give it:

[![Agent setup prompt](https://img.shields.io/badge/Agent_setup_prompt-open_%26_copy-2563eb?style=for-the-badge)](./AI-AGENT-SETUP.md)

Open [`AI-AGENT-SETUP.md`](./AI-AGENT-SETUP.md) and click the **copy icon** on its code block. Then paste it into your agent with your app's repo open. Web-capable agents can fetch its [raw URL](https://raw.githubusercontent.com/Bearound/bearound-cordova-sdk/main/AI-AGENT-SETUP.md) directly.

**The agent will pause for these human-only steps.** They need your Apple and Google accounts and a physical device, so no plugin or agent can do them:

- **Apple Developer portal:** the Push Notifications and Access Wi-Fi Information capabilities on your App ID, and your signing team.
- **Firebase:** your own `google-services.json` for push on Android.
- **On device:** grant location ("Always" on iOS) and Bluetooth, and keep Background App Refresh on.
- **Google Play:** the `connectedDevice` foreground-service declaration and demonstration video, only if you enable the foreground service; the background-location review, only if you declare `ACCESS_BACKGROUND_LOCATION`.

Prefer to wire it by hand? Everything the prompt references is spelled out in the sections below.

---

## Quick Start

The API is available as `cordova.plugins.Bearound` after `deviceready`.

```js
document.addEventListener('deviceready', async () => {
  const Bearound = cordova.plugins.Bearound;

  Bearound.addBeaconsListener((beacons) => console.log('beacons', beacons));
  Bearound.addErrorListener((error) => console.warn('sdk error', error.message));

  // Call configure() on every launch, not behind a button: the SDK arms its
  // background machinery only in a process where configure() ran.
  await Bearound.configure({ businessToken: 'your-business-token' });

  await Bearound.ensurePermissions();
  await Bearound.startScanning();
});
```

With TypeScript:

```ts
import type { BearoundPlugin, Beacon } from '@bearound/cordova-plugin';

const Bearound: BearoundPlugin = cordova.plugins.Bearound;
Bearound.addBeaconsListener((beacons: Beacon[]) => {});
```

## Permissions

| Method | Android | iOS |
| --- | --- | --- |
| `checkPermissions()` | Real status of each runtime permission | Location, Bluetooth and notification status |
| `requestForegroundPermissions()` | Prompts for location, Bluetooth scan and advertise (12+), notifications (13+) | Prompts for location ("Always") |
| `requestBackgroundLocation()` | Prompts for background location, only if your manifest declares it | Asks to upgrade location to "Always" |
| `requestNotificationPermission()` | Prompts for `POST_NOTIFICATIONS` (13+) | Shows the notification permission prompt |
| `ensurePermissions({ askBackground })` | Foreground prompts, then background when asked | Same |

All of them resolve with the current status. A denied permission is a resolved result,
never a rejection, and never stops the app.

Notes:

- **Android 12+** scans with Bluetooth alone: the SDK declares `BLUETOOTH_SCAN` with
  `neverForLocation`. If you redeclare that permission, keep the flag, or scan results
  are withheld unless location is granted.
- **Android background location** is not declared by the SDK and is not needed for
  beacon detection. Declare `ACCESS_BACKGROUND_LOCATION` yourself only if you want Wi-Fi
  observations while the app is in the background (it carries a Google Play review).
- **iOS Bluetooth** has no request API. The system prompt appears the first time
  scanning starts.
- **iOS location "Always"** is what lets iOS relaunch a terminated app when a beacon
  comes into range.

## Background behavior

`startScanning()` enables background detection on both platforms. There is no separate
background API.

**Android**

- The plugin registers a provider that runs at every process start, before any page
  loads, and sets the SDK listener. This is what keeps events flowing when Android wakes
  the app process in the background with no Activity (a native app does the same in
  `Application.onCreate`).
- Foreground and background: a regular BLE scan.
- App killed by the system, swiped away (Android 14+) or after reboot: a low-power scan
  registered with the OS wakes a fresh process when a Bearound beacon comes into range.
- `enableForegroundScanning()` adds a foreground service with a persistent notification
  for continuous scanning on aggressive manufacturers. It requires the
  `FOREGROUND_SERVICE_CONNECTED_DEVICE` permission (declared by the SDK) and a Google
  Play declaration.
- `isIgnoringBatteryOptimizations()`, `openBatteryOptimizationSettings()`,
  `isAutostartManageable()` and `openManufacturerAutostartSettings()` help the user
  exempt the app from battery restrictions.

**iOS**

- The plugin hooks the app launch natively, before any JavaScript runs: it sets the SDK
  delegate, registers the background tasks and installs the push handling. This is what
  makes detection work when iOS relaunches the app in the background, where no web page
  is loaded to call `configure()`.
- It also wires background fetch and background upload completion on the app delegate.
  If your app delegate already implements those methods, yours is still called.
- Region monitoring wakes a terminated app when location is "Always". An app the user
  force-quit from the app switcher is not relaunched by iOS until it is opened again.

Events that fire while no page is listening (up to 50) are delivered when the page
subscribes. For anything older, read `getPersistedLog()`: the native SDKs record every
detection, sync and region event with the app state it happened in.

## Push notifications

The SDK uses push for three things: a silent push that wakes the app to scan and sync,
measurement of receipt and tap for Bearound campaigns, and rich notifications (image,
two cards, carousel, video).

A Cordova app has no JavaScript running while it is closed, so push is handled natively
by the plugin. In the common case you write no push code.

### Android

1. Add Firebase to the app: place `google-services.json` in the project and enable the
   Gradle plugin in `config.xml`:

   ```xml
   <platform name="android">
       <preference name="GradlePluginGoogleServicesEnabled" value="true" />
       <resource-file src="google-services.json" target="app/google-services.json" />
   </platform>
   ```

2. That is all. The plugin registers a `FirebaseMessagingService` that:
   - sends the FCM token to the SDK, on first fetch and on every refresh;
   - hands every data message to the SDK, which wakes up, scans and syncs on a Bearound
     silent push, and draws the notification on a rich push;
   - forwards anything that is not a Bearound message, and every token refresh, to the
     other `FirebaseMessagingService` of your app, when there is one.

Taps are measured natively, both when the tap launches the app and when it resumes it.

**Using another push plugin.** Android delivers FCM messages to one service per app. The
plugin's service takes them and forwards the non-Bearound ones, so another push plugin
keeps receiving its messages. The forwarding instantiates the other service outside the
normal Android service lifecycle; a service that depends on that lifecycle (for example
one that calls `getApplication()`) may not work when forwarded to. In that case set
`BEAROUND_FCM_SERVICE_ENABLED=false` and forward to the SDK from your own service:

```kotlin
override fun onMessageReceived(message: RemoteMessage) {
    if (BeAroundSDK.getInstance(this).handleRemoteMessage(message.data)) return
    // your own handling
}

override fun onNewToken(token: String) {
    BeAroundSDK.getInstance(this).setPushToken(token)
}
```

If your push plugin only exposes messages to JavaScript, call
`handleRemoteMessage(data)` from its callback. This covers the app in the foreground or
background, not a closed app.

**Notification permission.** On Android 13+ a rich push only shows if the app holds
`POST_NOTIFICATIONS`. Call `requestNotificationPermission()`.

**Channel and icon.** The SDK uses your FCM default channel and icon when the manifest
declares them (`com.google.firebase.messaging.default_notification_channel_id`,
`com.google.firebase.messaging.default_notification_icon`), otherwise its own channel
and the app icon.

### iOS

1. Enable the **Push Notifications** capability for the App ID. The plugin adds the
   `aps-environment` entitlement and the `remote-notification` background mode.
2. That is all. At app launch the plugin registers for remote notifications (this only
   fetches the token, it does not prompt) and the SDK:
   - captures the APNs token and sends it with the next sync;
   - handles the Bearound silent push: scan, sync and receipt measurement;
   - measures taps through the notification center delegate.

To show visible notifications, ask the user with `requestNotificationPermission()`.

**Using another push plugin.** The SDK attaches to the app delegate methods at launch
and calls through to whatever implementation is already there, so plugins that implement
them keep working. If a plugin takes over the delegate in a way that hides the token
from the SDK (the symptom is a device with no push token), forward it from JavaScript:

```js
// The raw APNs device token, as hex. Not the FCM token.
await cordova.plugins.Bearound.setPushToken(apnsToken);
```

And forward the payload when that plugin hands you a notification:

```js
await cordova.plugins.Bearound.handleRemoteMessage(payload);   // on receipt
await cordova.plugins.Bearound.trackNotificationOpened(payload); // on tap
```

To turn the SDK's automatic delegate handling off, add
`BearoundAppDelegateProxyEnabled` = `false` to the app's `Info.plist`. You are then
responsible for the three calls above.

**Rich push on iOS** needs two app extension targets (a Notification Service Extension
and a Notification Content Extension) using the `BearoundSDKNotificationExtensions` pod.
A Cordova plugin cannot add extension targets, so this is a manual Xcode step, described
in the [iOS SDK README](https://github.com/Bearound/bearound-ios-sdk#rich-push-images-carousel-video).
Without the extensions a rich push is delivered as a regular notification with title and
body. Targets added by hand are lost when the iOS platform is removed and added again, so
do it from a Cordova hook: `example/hooks/ios-notification-extensions.js` adds both
targets and their pods on every `prepare`, and can be copied into an app as is. The
hook also survives a later `cordova plugin add`, which would otherwise put plugin files
in an extension target. The extensions are signed like the app, so pass the team to every
target when building:

```bash
cordova build ios --device --developmentTeam=TEAMID --automaticProvisioning \
  --buildFlag="DEVELOPMENT_TEAM=TEAMID" --buildFlag="IPHONEOS_DEPLOYMENT_TARGET=15.0"
```

## API

Every method returns a promise.

### Core

| Method | Description |
| --- | --- |
| `configure(config)` | Configures the SDK. See the options below. |
| `startScanning()` | Starts detection, foreground and background. |
| `stopScanning()` | Stops detection. |
| `isScanning()` | `boolean` |
| `setUserProperties({ internalId, email, name, customProperties })` | Associates the user with the events. |
| `clearUserProperties()` | Removes the association. |

`configure` options:

| Option | Default | Description |
| --- | --- | --- |
| `businessToken` | required | Your Bearound business token. |
| `scanPrecision` | `'high'` | `'high'`, `'medium'` or `'low'`. |
| `maxQueuedPayloads` | `100` | `50`, `100`, `200` or `500`. |
| `periodicReconciliationEnabled` | `true` | Periodic background reconciliation. Best effort. |
| `periodicReconciliationIntervalMs` | `1200000` | Minimum interval between runs. Clamped natively (10 min on iOS, 15 min on Android, up to 24 h). |
| `periodicScanDurationMs` | `12000` | Scan window inside the periodic task (3 to 15 s on iOS, 3 to 30 s on Android). |
| `presenceHeartbeatIntervalMs` | `300000` | How often an empty scan still reports in (1 min to 1 h). `0` turns it off. |
| `collectAdvertisingId` | `true` | Whether the advertising identifier may be read and reported. |
| `collectLocation` | `true` | Whether the device location may be reported. Detection is unaffected. |
| `collectWifi` | `true` | Whether nearby Wi-Fi access points may be reported. |
| `adaptiveSamplingEnabled` | `true` | Whether uploads follow the device's motion. Changes the upload cadence, not the readings. |
| `collectMotionSensors` | follows `collectLocation` or `collectWifi` | Whether motion sensors may be read to drive adaptive sampling. `false` turns every motion source off. |

### Push

| Method | Description |
| --- | --- |
| `setPushToken(token)` | Forwards a token manually. Android: FCM token. iOS: raw APNs token. |
| `handleRemoteMessage(data)` | Hands a payload received in JavaScript to the SDK. Resolves `true` for a Bearound message. |
| `trackNotificationOpened(data)` | Reports a tap. Each push is reported once. |

On iOS, `addPushScanListener` reports the scan the SDK ran after a Bearound silent push
(`{ beaconsFound, ingestStarted, pendingBatches }`).

### Error telemetry and readiness

| Method | Description |
| --- | --- |
| `setErrorReportingEnabled(enabled)` | Turns the native SDK's own error telemetry on or off. Default: on. |
| `getDetectionReadiness()` | iOS: what this install can detect right now, as the SDK evaluates it from permissions and background modes: `'full'`, `'backgroundBle'`, `'foregroundOnly'` or `'blind'`. Android resolves `'unknown'`. |

### Debug notifications

| Method | Description |
| --- | --- |
| `setDebugNotificationsEnabled(enabled)` | QA aid, off by default and persisted. Posts a local notification for each SDK event. |
| `isDebugNotificationsEnabled()` | `boolean` |

With it on, the plugin posts the same notifications as the native example apps (zone
enter and exit, scan started and stopped, beacon detected, sync, push-triggered scan, app
relaunched in the background), with the same texts and cooldowns. They are posted
natively, so they also appear when the OS wakes the app with no page loaded, which is the
practical way to watch background and terminated behavior on a lock screen. On iOS it
takes over the notification center delegate to show banners while the app is open. Do not
enable it in a production app.

### State and diagnostics

| Method | Result |
| --- | --- |
| `getSdkVersion()` | Native SDK version. |
| `isConfigured()` | `boolean` |
| `getCurrentScanPrecision()` | `'high'`, `'medium'`, `'low'` or `''`. |
| `getPendingBatchCount()` | Sync batches waiting for retry. |
| `getPendingBatches()` | Those batches, each a list of beacons, oldest first. |
| `isLocationAvailable()` | Whether location services are on. |
| `getAuthorizationStatus()` | Location authorization. |
| `getBluetoothState()` | `'poweredOn'`, `'poweredOff'`, `'unauthorized'`, `'unsupported'`, `'resetting'`, `'unknown'`. |
| `getPersistedLog()` | Native detection log, including background and terminated activity. |
| `clearPersistedLog()` | Clears it. |
| `getBleDiagnosticInfo()` | iOS only. Android resolves `''`. |
| `requestLocationAuthorization(level)` | iOS only. `'always'` or `'whenInUse'`. No-op on Android. |
| `requestTrackingAuthorization()` | iOS only. Android resolves `'unavailable'`. |
| `getTrackingAuthorizationStatus()` | iOS only. Android resolves `'unavailable'`. |

### Android only

On iOS these resolve a neutral value (see [docs/PARITY.md](docs/PARITY.md)).

| Method | Description |
| --- | --- |
| `enableForegroundScanning(config)` | Foreground service with a persistent notification. |
| `disableForegroundScanning()` | Stops it. |
| `isForegroundScanningEnabled()` | `boolean` |
| `setForegroundNotificationContent({ title, text })` | Content shown when beacons are detected. |
| `isIgnoringBatteryOptimizations()` | `boolean` |
| `openBatteryOptimizationSettings()` | Opens the system screen. |
| `isAutostartManageable()` | Whether the manufacturer has an autostart screen. |
| `openManufacturerAutostartSettings()` | Opens it. |

## Events

Each `add...Listener` returns a subscription with `remove()`.

| Method | Payload | Platforms |
| --- | --- | --- |
| `addBeaconsListener` | `Beacon[]` | Both |
| `addScanningListener` | `boolean` | Both |
| `addSyncLifecycleListener` | `{ type: 'started' \| 'completed', beaconCount, success?, error? }` | Both |
| `addBackgroundDetectionListener` | `{ beaconCount }` | Both |
| `addBeaconRegionListener` | `{ type: 'enter' \| 'exit' }` | Both |
| `addActiveScanListener` | `{ isActive }` | Both |
| `addBluetoothStateListener` | Bluetooth state | Both |
| `addErrorListener` | `{ message }` | Both |
| `addBluetoothZoneListener` | `{ type: 'enter' \| 'exit' }` | iOS |
| `addBluetoothScanModeListener` | `{ mode: 'idle' \| 'active', nextIdleScanAt? }` | iOS |
| `addPushScanListener` | `{ beaconsFound, ingestStarted, pendingBatches }` | iOS |

A beacon has `uuid`, `major`, `minor`, `rssi`, `proximity`, `accuracy`, `timestamp` and,
when available, `metadata`, `txPower`, `alreadySynced`, `syncedAt`. iOS adds
`discoverySources`; Android adds `rssiRaw`, `rssiSamples` and `isStale`.

## Errors

A rejected promise carries an `Error` with a stable `code`:

| Code | When |
| --- | --- |
| `INVALID_ARGUMENT` | Missing or empty business token or push token. |
| `CONFIG_ERROR`, `START_ERROR`, `STOP_ERROR` | The native call failed. |
| `PUSH_TOKEN_ERROR`, `HANDLE_REMOTE_MESSAGE_ERROR`, `TRACK_NOTIFICATION_OPENED_ERROR` | A push call failed. |
| `PERMISSION_NOT_DECLARED` | Android: the permission is not in the app manifest. |
| `PERMISSION_REQUEST_IN_PROGRESS` | Android: another prompt is still open. |
| `BEAROUND_ERROR` | Any other native failure. |

Conditions that are not call failures are reported as state or events:

| Situation | What you get |
| --- | --- |
| Permission denied | The permission methods resolve with the denied status. |
| Bluetooth off | `getBluetoothState()` resolves `'poweredOff'` and the state listener fires. |
| `startScanning()` before `configure()` | The promise resolves and the error listener fires with the SDK message. |

None of these stops the app.

### What the plugin guarantees

- **It never takes the host app down.** Every action answers its promise; a native
  failure becomes a rejection. The SDK's callbacks, the launch and process-start wiring,
  the push service and the Bluetooth state receiver all run guarded, so a failure there
  drops one event and nothing else. Numbers that cannot be represented in JSON (a
  distance that is not finite) are replaced before they cross the bridge.
- **It never prompts on its own.** No permission dialog appears unless your code calls
  one of the request methods. Reading the Bluetooth state on iOS does not raise the
  Bluetooth prompt, and registering for remote notifications only fetches a token.
- **It only asks for what the app declares.** On Android a permission that is not in the
  merged manifest is not requested.
- **Denied means unused.** The plugin has no detection of its own: it forwards to the
  native SDK, which checks each permission at runtime and degrades (no location: no
  position and, on iOS, no ranging; no Bluetooth: no scan; no notifications: nothing is
  posted). The `collect...` options go further and stop the SDK from reading a signal even
  when the permission is granted.

## Example app

`example/` is a Cordova app that mirrors the native BeAroundScan example apps: the same
sections, labels, beacon row, sorting, settings sheet, retry queue and detection log. It
asks for permissions, configures and starts scanning on launch, like they do, and shows
the SDK values as delivered, so readings can be compared side by side with a native build.

Reading the beacon row:

- Distance is shown only when the SDK has one. A beacon seen only over Bluetooth has
  proximity `bt` and no distance; on iOS, distance and the immediate/near/far levels
  come from Core Location ranging, which needs location authorized with full accuracy.
  The permissions card says so when it is off.
- The chips show which detector saw the beacon. On Android the row also shows the raw
  RSSI next to the smoothed one, the RSSI statistics of the sync window, and fades stale
  beacons.

```bash
cd example
npm install
npx cordova prepare          # adds the android and ios platforms
npm run plugin:install       # packs the plugin and installs it
npm run android              # or: npm run ios
```

Set your business token in the settings sheet (it is stored on the device), or prefill it
by copying `www/js/local-config.example.js` to `www/js/local-config.js`, which git
ignores. For push on Android, add your own `google-services.json` as described above.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `configure` rejects with `INVALID_ARGUMENT` | The business token is missing or empty. |
| No beacons on the iOS simulator or Android emulator | Neither has a Bluetooth radio. Use a physical device. |
| Android: no scan results on 12+ | `BLUETOOTH_SCAN` ("Nearby devices") was denied, or your manifest redeclares it without `neverForLocation` and location is denied. Check `checkPermissions()`. |
| Android: build fails resolving `bearound-android-sdk` | JitPack is unreachable or the Kotlin and AndroidX preferences are missing from `config.xml`. See [Android](#android). |
| iOS: `pod install` fails with a Unicode normalization error | Run the build with `LANG=en_US.UTF-8`. |
| iOS: build fails with a deployment target error on Xcode 27 | Set the deployment target to 15.0 in `config.xml` and `build.json`. See [iOS](#ios). |
| iOS: beacons have proximity `bt` and no distance | Distance comes from Core Location ranging, which needs location authorized with precise accuracy. |
| iOS: nothing happens after the app is force-quit | Expected: iOS does not relaunch an app the user removed from the app switcher until it is opened again. |
| iOS: device has no push token | The Push Notifications capability is missing on the App ID, or another plugin hides the token. See [Push notifications](#push-notifications). |
| iOS: rich push arrives as plain text | The two notification extension targets are missing. See [Push notifications](#push-notifications). |
| Android: rich push does not show | `POST_NOTIFICATIONS` was not granted (Android 13+). Call `requestNotificationPermission()`. |
| Events missing after the app was in the background | Up to 50 events are buffered for the page; read `getPersistedLog()` for the rest. |
| Android: the "scanning" notification stays up after the process was killed and recreated | The native SDK resumes scanning from its low-power OS scan, its watchdog alarm (15 minutes) or boot, not at the instant the process is recreated. Opening the app resumes it at once. |

## Limitations

- Rich push on iOS requires two extension targets in the app project. The plugin cannot
  add them; the example does it with a hook (see above).
- The JavaScript-layer error telemetry of the React Native and Flutter packages is not
  included. Native crashes and errors are still reported by the native SDKs.
- A terminated app is relaunched by the OS, not by the plugin: Android needs version 14+
  to survive a swipe from recents, and iOS does not relaunch an app the user force-quit.
- Verified on physical devices (an iPhone and a Samsung on Android 16); what was covered
  and what is still open is recorded in
  [docs/DEVICE-VERIFICATION.md](docs/DEVICE-VERIFICATION.md).

## License

MIT. See [LICENSE](LICENSE).
