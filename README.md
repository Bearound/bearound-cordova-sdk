# 🐻 Bearound Cordova SDK

[![npm](https://img.shields.io/npm/v/@bearound/cordova-sdk.svg)](https://www.npmjs.com/package/@bearound/cordova-sdk)
[![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS-brightgreen.svg)](#requirements)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Official SDK to integrate **Bearound's** secure BLE beacon detection into **Apache Cordova** apps (Android and iOS).
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
* [What the SDK detects](#what-the-sdk-detects)
* [Requirements](#requirements)
  * [Recommended setup](#recommended-setup-keep-bluetooth-and-location-on)
  * [Support matrix](#support-matrix)
* [Getting a business token](#getting-a-business-token)
* [Installation](#installation)
  * [Android](#android)
  * [iOS](#ios)
  * [Plugin variables](#plugin-variables)
* [Set up with an AI agent](#set-up-with-an-ai-agent)
* [Quick Start](#quick-start)
* [Permissions](#permissions)
  * [Encounter layer (device-to-device)](#encounter-layer-device-to-device)
* [Wi-Fi observations](#wi-fi-observations)
* [Presence heartbeat](#presence-heartbeat)
* [Advertising identifier (IDFA / AAID)](#advertising-identifier-idfa--aaid)
* [Controlling what the SDK collects](#controlling-what-the-sdk-collects)
* [Background behavior](#background-behavior)
  * [Google Play review (Android)](#google-play-review-android)
  * [Background reliability (Android)](#background-reliability-android)
  * [Detection log](#detection-log)
  * [Testing terminated app detection](#testing-terminated-app-detection)
* [Push notifications](#push-notifications)
* [Configuration options](#configuration-options)
  * [Scan precision](#scan-precision)
  * [Retry queue size](#retry-queue-size)
  * [User identity](#user-identity)
  * [Periodic reconciliation](#periodic-reconciliation)
* [API](#api)
* [Events](#events)
* [Models](#models)
* [Errors](#errors)
* [Example app](#example-app)
* [Troubleshooting](#troubleshooting)
* [Limitations](#limitations)
* [License](#license)
* [Changelog](#changelog)
* [Support](#support)

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

## What the SDK detects

The plugin detects **Bearound BLE beacons**, every hardware generation, through the native
SDKs. A beacon is matched by any of its Bearound signatures in the advertisement:

- the `0xBEAD` **service data** (major/minor, firmware, battery, motion and temperature),
- the `0xBEAD` **manufacturer data**, or
- the **Bearound iBeacon frame**.

It also recognises other phones running a Bearound SDK nearby (see
[Encounter layer](#encounter-layer-device-to-device)).

To validate the integration end to end, test on a **physical device** with a **physical
Bearound beacon** paired to your Control Hub account. The iOS simulator and the Android
emulator have no usable Bluetooth radio.

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

### Recommended setup: keep Bluetooth and Location on

For the best detection coverage, encourage your users to keep the following on:

1. **Bluetooth on.** Detection runs entirely over BLE. If Bluetooth is turned off and back
   on, the SDK re-arms the scan by itself.
2. **Location Services on.** Several Android manufacturers tie BLE scan delivery to the
   system Location toggle, and on Android 11 and below it is required. On iOS, location is
   what gives distance and survives a force-quit.
3. **Permissions granted.** "Nearby devices" on Android 12+, and location on both
   platforms ("Always" on iOS for the strongest background behavior).

The more of these the user keeps on, the more consistently the SDK works. Nothing breaks
when one is missing: detection degrades, it never crashes (see
[What the plugin guarantees](#what-the-plugin-guarantees)).

### Support matrix

**Android**

| Android version | Without the foreground service | With the foreground service | After force-stop or swipe from recents |
| --- | --- | --- | --- |
| 7.0 to 7.1 (API 24 to 25) | Foreground and background while the process is alive | ✅ persistent notification keeps the process scanning | ❌ |
| 8.0 to 13 (API 26 to 33) | ✅ an OS-registered scan wakes the app when a beacon appears | ✅ recommended for reliability | ❌ force-stop cancels the scan registration |
| 14+ (API 34+) | ✅ OS-registered scan | ✅ optional | ✅ the OS-registered scan survives both |

**iOS**

| | Bluetooth only | Bluetooth + Location "Always" |
| --- | --- | --- |
| Foreground detection | ✅ | ✅ with distance |
| Background detection | ✅ | ✅ |
| App terminated by **iOS** (memory or battery pressure) | ✅ | ✅ |
| App force-quit by the **user** (swipe up in the app switcher) | ❌ | ✅ region monitoring persists |

On every Android version, aggressive manufacturer battery managers can still evict the app:
see [Background reliability](#background-reliability-android).

---

## Getting a business token

The **business token** authenticates your app against the Bearound backend and ties every
detection to your business. It is provisioned by the **Bearound team** together with your
**Control Hub** account, the dashboard where registered devices and detections show up. If
you do not have one, ask your Bearound contact or write to `contact@bearound.com`.

Behavior with a wrong or missing token:

- An **empty** token makes `configure()` reject with `INVALID_ARGUMENT`. The SDK stays
  inactive and the app keeps running.
- A **non-empty but invalid** token is not validated on the device: scanning starts
  normally, but every upload fails. You see it as `addSyncLifecycleListener` events with
  `success: false`, a growing `getPendingBatchCount()`, and a device that never appears in
  the Control Hub. If nothing shows up in the Hub, check the token first.

Keep the token out of version control: read it from a build-time or local configuration
file that git ignores, as the example app does.

---

## Installation

```bash
cordova plugin add @bearound/cordova-sdk
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
cordova plugin add @bearound/cordova-sdk \
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
import type { BearoundPlugin, Beacon } from '@bearound/cordova-sdk';

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

### Encounter layer (device-to-device)

Besides listening for beacons, every device running a Bearound SDK also **advertises a
Bearound service** and **recognises other SDK devices nearby**, reporting those sightings in
the regular sync. Nothing stable goes on the air: each device transmits a random identifier
that rotates every 15 minutes, carried inside the advertisement itself. There are no
connections between devices.

| Platform | What it needs | If not granted |
| --- | --- | --- |
| Android 12+ | `BLUETOOTH_ADVERTISE`, part of the same "Nearby devices" dialog as the scan permission. `requestForegroundPermissions()` and `ensurePermissions()` ask for it. | The device still detects beacons and other devices, but no other device can see it. |
| iOS | The Bluetooth permission, nothing else. | No detection at all over Bluetooth. |

Notes:

- The layer needs no code. It starts and stops with `startScanning()` and
  `stopScanning()`.
- An iPhone is fully visible to Android devices while its app is in the foreground. In the
  background iOS restricts what an app may advertise, so Android devices may not see it.
- On Android, a nearby SDK device also wakes the app through the same OS-registered scan
  that beacons use.
- It adds no second radio scan: it reuses the scan the SDK already runs.

## Wi-Fi observations

Alongside each beacon sighting the SDK reports the **access points visible at that moment**.

**No network name is used as identity.** What travels is a one-way hash of the access
point's hardware address, canonicalised so the same router yields the same identifier on
both platforms.

Collection is on by default, but data only exists when the app holds the required
permissions. A missing permission produces empty Wi-Fi observations, not an error:

| Platform | What it reports | What you must do |
| --- | --- | --- |
| **Android** | The connected access point **and its neighbours**, with RSSI | Grant precise location (`ACCESS_FINE_LOCATION`) and keep system Location on. `requestForegroundPermissions()` and `ensurePermissions()` ask for it. |
| **iOS** | Only the **connected** access point, without RSSI (there is no public API for neighbours) | Enable the **Access Wi-Fi Information** capability on your App ID. The plugin already adds the entitlement to the app. |

Nothing degrades without them: the field is omitted and every other feature behaves the
same.

> **In the background, Wi-Fi needs one permission more, and its absence is invisible.**
>
> - **Android:** from Android 10 on, a backgrounded app without
>   `ACCESS_BACKGROUND_LOCATION` gets an empty scan list. No error: the Wi-Fi list simply
>   arrives empty as soon as the app leaves the foreground, with every other permission
>   granted.
> - **iOS:** with "While Using" the system stops revealing the access point in the
>   background. "Always" is what the SDK asks for, but treat background Wi-Fi on iOS as
>   opportunistic, not guaranteed.
>
> A hand test with the app open passes, while background collection stays empty. Beacon
> detection is **not** affected either way.

That is why the plugin never asks for background location on its own: on Android it is a
permission with a Google Play policy review, and requesting it opens the system settings
screen. If your app needs Wi-Fi observations in the background, declare the permission in
your `config.xml` and ask for it explicitly, after foreground location was granted:

```xml
<platform name="android">
    <config-file target="AndroidManifest.xml" parent="/manifest">
        <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    </config-file>
</platform>
```

The `android:` attribute needs `xmlns:android="http://schemas.android.com/apk/res/android"`
on the `<widget>` element of your `config.xml`.

```js
const status = await cordova.plugins.Bearound.requestBackgroundLocation();
// status.backgroundLocation tells you the outcome
```

If the manifest does not declare the permission, the call rejects with
`PERMISSION_NOT_DECLARED` instead of prompting.

## Presence heartbeat

A device that sees no beacon and no other SDK device would otherwise stay silent, and the
backend could not tell **"there was no coverage here"** apart from **"the app was not
running"**. Those two look identical in the data and mean opposite things.

So a scan that finds nothing still reports in, carrying what the device can observe: its
own location and the Wi-Fi around it.

```js
await cordova.plugins.Bearound.configure({
  businessToken: 'your-business-token',
  presenceHeartbeatIntervalMs: 5 * 60 * 1000, // default
});
```

| | |
| --- | --- |
| Default | 5 minutes (`300000`) |
| Accepted range | 1 minute to 1 hour (clamped natively) |
| Turn it off | `0` |

Two things it does **not** do. It never throttles **scanning**, only the upload, so
detection latency is untouched. And it sends nothing when there is neither a location fix
nor an access point to report: an app that grants no permissions, or that turned both
signals off in [`configure`](#controlling-what-the-sdk-collects), sends no heartbeat.

## Advertising identifier (IDFA / AAID)

The SDK can report the advertising identifier, the resettable, user-controlled identifier
used for advertising.

**iOS: you must ask.** Add the usage description to your `config.xml`:

```xml
<platform name="ios">
    <config-file target="*-Info.plist" parent="NSUserTrackingUsageDescription">
        <string>We use this identifier to measure visits and show you more relevant offers.</string>
    </config-file>
</platform>
```

and call the request with the app in the **foreground**, at a point where the user has
just been told why:

```js
const status = await cordova.plugins.Bearound.requestTrackingAuthorization();
// 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unavailable'
```

Without the key iOS shows **no dialog at all** and the status stays `notDetermined`. The
prompt appears once per install, so the call is safe on every launch. To read the state
without prompting, use `getTrackingAuthorizationStatus()`.

**Android: you opt in from your app.** The SDK does not declare the `AD_ID` permission and
the plugin does not link Play Services' advertising library. To share the id, add
`com.google.android.gms:play-services-ads-identifier` to your Android build; its manifest
declares `com.google.android.gms.permission.AD_ID`. Without `AD_ID`, from `targetSdk` 33
the platform returns a zeroed id and the SDK reports none. There is no runtime prompt: the
user's choice lives in system settings.

> **Store obligations follow the feature, not the SDK.** Prompting for tracking obliges you
> to declare **Tracking** in your App Store privacy label; the `AD_ID` permission obliges
> you to tick **"Device or other IDs"** in the Play Data Safety form. Apps for children
> must not carry `AD_ID` (Play Families policy).

If your app collects the advertising identifier for its own purposes but you do not want
it sent to Bearound, pass `collectAdvertisingId: false`.

## Controlling what the SDK collects

Three of the signals in the payload describe the **person**, not the sighting: the
advertising identifier, the device's own coordinates, and the Wi-Fi access points around
it. Your app may collect them for its own purposes and still not want to share them with
Bearound: a different legal basis, a store declaration you do not want to extend, or a
client policy that says no.

Each one has a switch in `configure()`, on both platforms:

```js
await cordova.plugins.Bearound.configure({
  businessToken: 'your-business-token',
  collectAdvertisingId: false, // default: true
  collectLocation: false,      // default: true
  collectWifi: true,           // default: true
});
```

**All three default to `true`**, so an integration that does not mention them reports
everything the granted permissions allow.

A switch turned off means **collect nothing**, not "collect and withhold": the value is
never read from the platform.

| Switch | What disappears from the payload | Also |
| --- | --- | --- |
| `collectAdvertisingId: false` | The advertising identifier and the tracking status | iOS: `requestTrackingAuthorization()` shows no prompt and only reports the current status. Android never queries Play Services for the id. |
| `collectLocation: false` | The device's coordinates | The location permission status is still reported: it says what the user granted, not where they are. |
| `collectWifi: false` | The Wi-Fi access points and the connected network | No Wi-Fi read is issued at all. |

**Beacon detection is never affected.** With `collectLocation: false` the SDK still wakes,
detects and reports beacons; it stops saying where the device was.

What it does affect is the [presence heartbeat](#presence-heartbeat): a scan that found
nothing only reports in when it has a location or an access point to carry. Turn both off
and the heartbeat stops firing, by design.

Two related options: `adaptiveSamplingEnabled` lets the upload cadence follow the device's
motion, and `collectMotionSensors: false` turns every motion source off.

The choices are persisted with the rest of the configuration, so they survive the
background relaunches both systems perform on the SDK's behalf.

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

### Google Play review (Android)

The native SDK declares its permissions and components, and the manifest merger adds them
to your app. Two consequences on the Play Console:

- **Foreground service type.** Every app that embeds the SDK carries
  `FOREGROUND_SERVICE_CONNECTED_DEVICE` in its merged manifest, even if it never calls
  `enableForegroundScanning()`. With `targetSdk` 34+, Play asks you to declare each
  foreground-service type present in the manifest, with a video showing the user-facing
  feature that justifies it. Plan for it in your release: it surfaces at review time, not
  at build time. If you do not use the foreground service, you can remove the permission
  from the merged manifest and skip the declaration; the
  [Android SDK README](https://github.com/Bearound/bearound-android-sdk#google-play-review--what-the-manifest-merge-means-for-your-app)
  shows the manifest entry.
- **Background location.** The SDK does not declare `ACCESS_BACKGROUND_LOCATION`. Declaring
  it yourself puts the app through Play's background-location review, and requesting it
  opens the system settings screen, so the plugin never requests it on its own.

### Background reliability (Android)

Keeping the process eligible to wake under Doze and manufacturer battery managers is the
main field factor for reliable detection. The plugin exposes the SDK helpers:

```js
const Bearound = cordova.plugins.Bearound;

if (!(await Bearound.isIgnoringBatteryOptimizations())) {
  // Explain why first, then open the system screen where the user exempts the app.
  await Bearound.openBatteryOptimizationSettings();
}
if (await Bearound.isAutostartManageable()) {
  // Xiaomi, Huawei, Oppo, Vivo, OnePlus: the manufacturer's autostart screen.
  await Bearound.openManufacturerAutostartSettings();
}
```

`openBatteryOptimizationSettings()` opens the system list, not the restricted
"ignore battery optimizations" request, so it has no Google Play policy impact. On Samsung,
which has no autostart screen an app can open, guide the user to add the app to "Never
sleeping apps". The per-manufacturer behavior is listed in the
[Android SDK README](https://github.com/Bearound/bearound-android-sdk#oem-caveat-matrix).

When the system kills and recreates the app process, the SDK resumes continuous scanning
and uploads the next time the OS scan matches a beacon, on its periodic watchdog, at boot,
or as soon as the user opens the app.

### Detection log

Nobody is watching the console while the app is closed. The native SDKs keep a persisted
log for that, tagging every event with the app state it happened in:

```js
const entries = await cordova.plugins.Bearound.getPersistedLog();
// [{ id, timestamp, state, type, detail }, ...] newest first
await cordova.plugins.Bearound.clearPersistedLog();
```

`state` is `foreground`, `background`, `backgroundLocked` or `terminated`. The last one
means the OS started the app with no user interface, which is the proof that detection
worked with the app closed. The entries are on disk, so they are still there when the user
opens the app. The `type` and `detail` strings are the same on Android and iOS, so one
screen renders both.

### Testing terminated app detection

1. Install the app on a physical device and open it once.
2. Grant the permissions and let `startScanning()` run.
3. Close the app: swipe it away, or let the system reclaim it.
4. Stay out of range of the beacon for about a minute, then walk back into range.
5. Open the app and read `getPersistedLog()`: look for entries with `state: 'terminated'`.

To watch it live on the lock screen during QA, turn on
`setDebugNotificationsEnabled(true)` (see [Debug notifications](#debug-notifications)).

Keep in mind:

- The OS decides when to wake the app. It is not instant, and Low Power Mode or battery
  saver reduce how often it happens.
- iOS only relaunches an app the user force-quit when location is "Always".
- Android only survives a swipe from recents or a force-stop on version 14+.

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

## Configuration options

Every option below is a field of `configure()`. The full list is in the [API](#api).

### Scan precision

Controls how hard the radio works and how often detections are uploaded:

```js
await cordova.plugins.Bearound.configure({
  businessToken: 'your-business-token',
  scanPrecision: 'high', // default
});
```

| Mode | Behavior | Use case |
| --- | --- | --- |
| `'high'` | Continuous scanning with the most frequent uploads | Maximum detection, higher battery usage |
| `'medium'` | Continuous scanning at a balanced radio duty, upload every 60 s | Balanced detection and battery |
| `'low'` | Lowest radio duty, upload every 60 s | Maximum battery savings |

The plugin defaults to `'high'` on both platforms, like the React Native and Flutter
packages. Active scanning is also gated by beacon presence: outside a beacon zone only the
low-power OS scan runs, and the full scan starts on the first detection.

### Retry queue size

Failed upload batches are persisted on the device and retried, up to a configurable
limit:

```js
await cordova.plugins.Bearound.configure({
  businessToken: 'your-business-token',
  maxQueuedPayloads: 100, // 50, 100 (default), 200 or 500
});

const pending = await cordova.plugins.Bearound.getPendingBatchCount();
const batches = await cordova.plugins.Bearound.getPendingBatches(); // oldest first
```

### User identity

`internalId` is **your own id for the user**, for example from your CRM. Set it right after
`configure()`, so every beacon event carries it:

```js
const Bearound = cordova.plugins.Bearound;

await Bearound.configure({ businessToken: 'your-business-token' });
await Bearound.setUserProperties({ internalId: 'user123' });

// More data later:
await Bearound.setUserProperties({
  internalId: 'user123',
  email: 'user@example.com',
  name: 'John Doe',
  customProperties: { plan: 'premium' },
});

// On logout:
await Bearound.clearUserProperties();
```

The native SDKs keep the user association across the relaunches the OS performs in the
background, so events detected with the app closed stay attributed to the user.

### Periodic reconciliation

A best-effort safety net: a periodic background task that re-arms the background scan,
waits a short collection window and drains pending data through the regular sync. The
OS-registered scan remains the primary detection mechanism; this layer only complements
it, and the OS decides when it actually runs.

```js
await cordova.plugins.Bearound.configure({
  businessToken: 'your-business-token',
  periodicReconciliationEnabled: true,          // default
  periodicReconciliationIntervalMs: 20 * 60000, // default: 20 min
  periodicScanDurationMs: 12000,                // default: 12 s
});
```

The interval and the scan window are clamped natively (see the option table in the
[API](#api)). Pass `periodicReconciliationEnabled: false` to turn the layer off.

### Bluetooth metadata

Beacon metadata (battery, temperature, firmware, movements) arrives in the same Bearound
advertisement and is exposed as `beacon.metadata`. No configuration is needed.

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

## Models

The TypeScript definitions in `types/index.d.ts` are the reference. The main shapes:

### Beacon

| Field | Type | Notes |
| --- | --- | --- |
| `uuid` | `string` | The Bearound beacon UUID |
| `major`, `minor` | `number` | The beacon's identity |
| `rssi` | `number` | Smoothed signal strength |
| `proximity` | `'immediate' \| 'near' \| 'far' \| 'bt' \| 'unknown'` | `'bt'` marks a beacon seen over Bluetooth only, with no distance |
| `accuracy` | `number` | Estimated distance in metres; `-1` when unknown |
| `timestamp` | `number` | Epoch milliseconds |
| `metadata` | `BeaconMetadata` | Present once a full Bearound frame was captured |
| `txPower` | `number` | Optional |
| `alreadySynced`, `syncedAt` | `boolean`, `number` | Set after a successful upload |
| `discoverySources` | `string[]` | iOS only: which detector saw the beacon |
| `rssiRaw` | `number` | Android only: last unsmoothed sample |
| `rssiSamples` | `RssiStats` | Android only: statistics of the sync window |
| `isStale` | `boolean` | Android only: no packet recently, still within the timeout |

### BeaconMetadata

| Field | Type | Notes |
| --- | --- | --- |
| `firmwareVersion` | `string` | An integer encoded as a string |
| `batteryLevel` | `number` | Millivolts |
| `movements` | `number` | Movement counter |
| `temperature` | `number` | |
| `txPower`, `rssiFromBLE`, `isConnectable` | optional | |

### RssiStats

Per-beacon RSSI statistics accumulated over each sync window: `count`, `min`, `max`,
`avg`, `stdDev`, `firstSeen`, `lastSeen`.

### UserProperties

`internalId`, `email`, `name` (all optional strings) and `customProperties`, a map of
string to string.

### PersistedLogEntry

`id`, `timestamp` (epoch milliseconds), `state` (`foreground`, `background`,
`backgroundLocked` or `terminated`), `type` and `detail`. See
[Detection log](#detection-log).

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

### Beacons not detected

1. **Are you testing with a physical Bearound beacon on a physical device?** That is the
   supported way to validate the integration. Simulators and emulators have no usable BLE.
2. Follow the [recommended setup](#recommended-setup-keep-bluetooth-and-location-on):
   Bluetooth on, Location Services on, permissions granted. Check them with
   `checkPermissions()` and `getBluetoothState()`.
3. On Android 12+, `BLUETOOTH_SCAN` ("Nearby devices") is the permission that unlocks the
   scan. If your manifest redeclares it, keep the `neverForLocation` flag, or scan results
   are withheld unless location is granted.
4. Listen to `addErrorListener`: the SDK reports why it cannot scan.
5. On iOS, a beacon with proximity `bt` and no distance is detected over Bluetooth only.
   Distance comes from Core Location ranging, which needs location authorized with precise
   accuracy.

### Device does not appear in the Control Hub, or sync fails

1. **Check the business token.** A wrong token is not validated on the device and fails
   every upload. See [Getting a business token](#getting-a-business-token).
2. Check connectivity. Failed batches accumulate (`getPendingBatchCount()`) and are retried.
3. Watch `addSyncLifecycleListener`: a `completed` event carries `success` and `error`.

### No detection in the background or with the app closed

1. `configure()` must run on every launch, not behind a button.
2. Check the [support matrix](#support-matrix): a swipe from recents needs Android 14+, and
   a force-quit on iOS needs location "Always".
3. On Android, run the [Background reliability](#background-reliability-android) flow.
4. On iOS, keep Background App Refresh on. Low Power Mode reduces background wake-ups.
5. Read `getPersistedLog()` for entries with `state: 'background'` or `'terminated'`.

### Push problems

| Symptom | Likely cause and fix |
| --- | --- |
| iOS: the device has no push token | The Push Notifications capability is missing on the App ID, or another plugin hides the token. See [Push notifications](#push-notifications). |
| iOS: a rich push arrives as plain text | The two notification extension targets are missing. See [Push notifications](#push-notifications). |
| Android: a rich push does not show | `POST_NOTIFICATIONS` was not granted (Android 13+). Call `requestNotificationPermission()`. |
| Android: no push at all | `google-services.json` is missing or the Google Services Gradle plugin is not enabled. |

### Build problems

| Symptom | Likely cause and fix |
| --- | --- |
| Android: the build fails resolving `bearound-android-sdk` | JitPack is unreachable, or the Kotlin and AndroidX preferences are missing from `config.xml`. See [Android](#android). |
| iOS: `pod install` fails with a Unicode normalization error | Run the build with `LANG=en_US.UTF-8`. |
| iOS: deployment target error on Xcode 27 | Set the deployment target to 15.0 in `config.xml` and `build.json`. See [iOS](#ios). |

### Configuration and events

| Symptom | Likely cause and fix |
| --- | --- |
| `configure` rejects with `INVALID_ARGUMENT` | The business token is missing or empty. |
| Events missing after the app was in the background | Up to 50 events are buffered for the page. Read `getPersistedLog()` for the rest. |

## Limitations

- Rich push on iOS requires two extension targets in the app project. The plugin cannot
  add them; the example does it with a hook (see above).
- The JavaScript-layer error telemetry of the React Native and Flutter packages is not
  included. Native crashes and errors are still reported by the native SDKs.
- A terminated app is relaunched by the OS, not by the plugin: Android needs version 14+
  to survive a swipe from recents, and iOS does not relaunch an app the user force-quit.

## License

MIT. See [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

For issues and questions, open an issue at
https://github.com/Bearound/bearound-cordova-sdk/issues or write to
`contact@bearound.com`.
