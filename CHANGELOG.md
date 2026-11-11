# Changelog

Versions follow the native Bearound SDK the plugin is built on.

## 3.18.0

First release. Built on the native Bearound SDK 3.18.0 for Android and iOS.

- Promise-based JavaScript API with TypeScript types, exposed as
  `cordova.plugins.Bearound`.
- Configuration, scanning, user properties, state and diagnostics, with the same names
  as the React Native package.
- Events for beacons, scanning state, sync lifecycle, background detection, beacon
  region, active scan, Bluetooth state and errors. Events emitted while no page is
  subscribed are buffered and delivered on subscription.
- Native runtime permission prompts on Android and iOS, including the notification
  permission.
- Push on Android: FCM token capture, silent-push wake-up and rich notifications handled
  natively with the app closed, coexisting with another `FirebaseMessagingService`.
- Push on iOS: APNs token capture, silent-push wake-up and tap measurement installed at
  app launch, before any JavaScript runs.
- iOS launch wiring without editing the app delegate: SDK delegate, background tasks,
  background fetch and background upload completion.
- Android process-start wiring through a provider, so events from a process the OS woke
  up in the background reach the SDK listener.
- Debug notifications (`setDebugNotificationsEnabled`), with the texts and cooldowns of
  the native example apps, posted natively on both platforms.
- `getPendingBatches`, the push-triggered scan event on iOS (`addPushScanListener`) and
  `preciseLocation` in the permission result.
- `configure()` leaves a running scan alone when the configuration did not change, so a
  relaunch in the background does not switch the scanner off (the React Native and
  Flutter bridges stop and restart it on every call).
- `setErrorReportingEnabled`, `getDetectionReadiness` and the `adaptiveSamplingEnabled` and
  `collectMotionSensors` options, straight from the native SDKs.
- Example Cordova app for Android and iOS, mirroring the native BeAroundScan examples.
