# Device verification

Record of the checks run on physical devices. Fill one block per device and build.
Simulator and emulator runs do not count here: neither has a Bluetooth radio.

## Already verified without devices

| Check | Android (emulator, API 36) | iOS (simulator, iOS 26.5) |
| --- | --- | --- |
| Plugin installs into a clean Cordova app | Yes | Yes |
| Example app builds | Yes (`cordova build android`) | Yes (`cordova build ios --emulator`) |
| App launches, native SDK version read from JavaScript | Yes (3.18.0) | Yes (3.18.0) |
| Launch wiring runs before JavaScript | SDK initialized at plugin load | Background tasks registered and notification delegate installed at launch |
| `configure()` with an empty token | Rejects `INVALID_ARGUMENT`, app keeps running | Rejects `INVALID_ARGUMENT`, app keeps running |
| `startScanning()` before `configure()` | Error event with the SDK message, app keeps running | Error event with the SDK message, app keeps running |
| State and permission reads | Yes | Yes |

## Runs on physical devices

### iPhone 17 Pro Max, 2026-11-10, debug build (cordova-ios 8.2.0, native SDK 3.18.0)

| Check | Result | Evidence (device console) |
| --- | --- | --- |
| Signed build installs and launches | Pass | Automatic signing, development profile with push |
| Launch wiring runs before JavaScript | Pass | `Background refresh task registered: io.bearound.sdk.sync` and `...processing` logged before the plugin loads |
| Notification delegate installed at launch | Pass | `No UNUserNotificationCenterDelegate set, installed a minimal SDK delegate` |
| APNs token captured with no app code and before `configure()` | Pass | `Auto push capture enabled; requested APNs registration`, then `APNs token captured automatically (32 bytes)` |
| Bluetooth state reaches JavaScript | Pass | `bluetooth state: poweredOn` from the example page |
| `configure()` accepted and persisted | Pass | SDK config on device: `is_configured = true`, `technology = cordova`, `scan_precision = high` |
| Foreground: beacon region entered | Pass | Native log, state `foreground`: `Região: Entrou na zona do beacon` |
| Foreground: beacon detected and synced | Pass | Native log, state `foreground`: `Sync OK: 1 beacon(s) enviados ao ingester` |
| Background: detection and sync continue | Pass | Native log, state `background`: 7 entries `Sync OK: 1 beacon(s) enviados ao ingester` between 21:20 and 21:25 |
| Foreground, two beacons in range | Pass | Native log, state `foreground`: `Sync OK: 2 beacon(s) enviados ao ingester`; 71 successful syncs in the session |
| Sync failure is reported, not fatal | Observed | One `Sync falhou: 3 beacon(s) · Invalid server response` at the moment the app was replaced by a reinstall; the next syncs succeeded |
| Terminated: process killed while in background (SIGKILL over the cable) | Pass | New process 2 s after the kill, with no user action. Native log, state `terminated`: `Sync OK: 2 beacon(s) enviados ao ingester` at 21:41:18, then 25 more successful syncs in the next minute |
| Relaunch does not cycle the scanner | Pass after fix | Before: every launch logged `BLE_SCAN_STOPPED` and `Sync falhou: 0 beacon(s) · Invalid server response`, because `configure()` stopped and restarted the scan. After: neither entry on the relaunch at 21:41:16 |
| App ID on the Apple portal | Pass | `io.bearound.cordova.example`, explicit, Push Notifications and Access Wi-Fi Information enabled |
| APNs accepts pushes for the Cordova bundle | Pass | Six pushes sent to the sandbox with the team-scoped key and topic `io.bearound.cordova.example`, all HTTP 200: silent, text, `IMAGE`, `TWO_IMAGES`, `CAROUSEL`, `PLAY` |
| Notification extensions shipped in the app | Pass | `NotificationService.appex` and `NotificationContent.appex` present in the signed package |
| Silent push triggers scan and sync | Not proven | A background `Sync OK` 8 s after the push, but background syncs were already frequent; the debug notification `Push → Scan` on the device is the proof |
| Text push shown on the device | Pass | Confirmed on the device by the owner |
| Rich formats drawn on the device (`IMAGE`, `TWO_IMAGES`, `CAROUSEL`, `PLAY`) | Pass | Confirmed on the device by the owner; drawn by the two notification extensions added by the example hook |
| Push token registered in the backend | Pass | Device registered with the app id and a valid token 15 s after launch |
| Push sent through the Bearound platform | Pass | One alert push targeted at this single device: 1 sent, 0 failed |
| Receipt measured | Pass | Recorded 0.9 s after the send |
| Open measured | Pass | Recorded when the owner tapped the notification, about 9 minutes after the send |
| Fresh install, no beacon in range | Pass | Clean launch (no `BLE_SCAN_STOPPED`, no failed sync), token registered in the backend 5 s after launch, and the presence heartbeat alone: `Sync OK: 0 beacon(s)` at 23:29:47 and 23:34:48, exactly 5 minutes apart, with no zone entry |
| Debug notifications in foreground | Pass (simulator) | Banner `Escaneamento Iniciado` shown with the app open |
| `configure()` with an empty token | Pass | Example page showed `configure failed, INVALID_ARGUMENT: Business token is required`; app kept running |

### Samsung Galaxy A16 (SM-A166M), Android 16 (API 36), 2026-11-11, debug build (cordova-android 15.1.0, native SDK 3.18.0)

The first part of the run was offline (no Wi-Fi, no mobile data); registration, sync,
background and process death were run after Wi-Fi was turned on. Detection of a physical beacon and push are still open, as the last rows say.

| Check | Result | Evidence |
| --- | --- | --- |
| Debug build installs and launches | Pass | App on screen with the native SDK version read from JavaScript (3.18.0) |
| Every permission denied | Pass | Location and nearby devices denied at the prompts: app kept running, the permissions card showed all three denied, and the SDK answered with the error event `BLUETOOTH_SCAN (Nearby devices) required on Android 12+ to start the BLE scan` |
| Permissions granted | Pass | `ACCESS_FINE_LOCATION`, `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE` and `POST_NOTIFICATIONS` granted through the prompts the plugin raised; `ACCESS_BACKGROUND_LOCATION` left ungranted |
| Process-start wiring | Pass | On a cold start the SDK logged `Boot: Restarting scanning` and `Started BLE scanning` before `App foregrounded`, that is before any page loaded |
| Scan starts with permissions | Pass | `MEDIUM precision: continuous BALANCED scan, sync every 60s` |
| Foreground service | Pass | `BeaconScanService started in foreground`, service record with `isForeground=true` |
| No network | Pass | `Unable to resolve host` reported through the error listener; app kept running |
| Background location prompt on every launch | Fixed (example) | The example asked for background location on each launch, which on Android opens the system settings screen. It is now an explicit button in the settings sheet |
| Launch without leaving the app | Pass | After the fix the app opens on its main screen; no system settings page |
| Device registration and sync (Wi-Fi on) | Pass | `Register succeeded (HTTP 200)`; `Sending 0 beacon(s)` then `Successfully sent 0 beacon(s)`; the page received `sync started` and `sync completed, success: true` |
| Encounter mesh starts | Pass | `Encounter mesh started`, `Advertising encounter service (identity in scan response)`, `Advertising virtual beacon` |
| Background | Pass | `App backgrounded`, sync timer re-armed, `BeaconScanService started in foreground`, process state 4 (foreground service) |
| Process killed (kill -9) | Partial | A new process was up 3 s later with the plugin's process-start wiring and the foreground service running. Scanning and the sync timer did not resume in the following 95 s: the SDK only restarts them from its kernel scan, its watchdog alarm (15 min) or boot, exactly as in a native app |
| Process killed by a system WebView update | Pass | Android recreated the process for the foreground service without any user action |
| Beacon detection | Not run | No Bearound signal near this phone: the native example on the same device also had zero scan results |
| Detecting another phone through the mesh | Pass | An iPhone running the native iOS example in the foreground next to the phone: the Bluetooth stack counted 68 matches on the iBeacon filter and 25 on the mesh service filter, the SDK logged `No new beacons, syncing encounter batch` and `Successfully sent 1 beacon(s)` |
| iPhone in the background or locked | Not detected (expected) | With the iPhone locked every scan filter stayed at zero matches. iOS only emits the virtual beacon and a filterable mesh service UUID in the foreground |
| Process killed with a peer nearby | Partial | New process 2 s after `kill -9`, mesh restarted, and the peer kept arriving through the OS scan (349 results in 3 minutes, app in background). No upload happened in those 3 minutes: the sync timer is not re-armed in the revived process. Opening the app armed it and the encounter was sent on the next cycle |
| Push | Not run | Needs a `google-services.json` |

## Environment

| Field | Android | iOS |
| --- | --- | --- |
| Device model | | |
| OS version | | |
| Plugin version | | |
| Native SDK version (`getSdkVersion()`) | | |
| cordova-android / cordova-ios | | |
| Build type (debug / release) | | |
| Beacon identifier (major.minor) | | |
| Date | | |

## Permissions granted for the run

| Permission | Android | iOS |
| --- | --- | --- |
| Location (level) | | |
| Bluetooth | | |
| Notifications | | |
| Battery optimization exemption | | n/a |

## Checks

For each check record: steps taken, result, and evidence (screenshot, persisted log
excerpt from `getPersistedLog()`, or device log).

### Detection and sync

| # | Check | Android | iOS | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Foreground: beacon appears in the beacons listener | | | |
| 2 | Foreground: sync starts and completes with success | | | |
| 3 | Background, screen on: detection and sync continue | | | |
| 4 | Background, screen locked: detection and sync continue | | | |
| 5 | App closed by the system: OS relaunch detects the beacon | | | |
| 6 | App swiped from recents (Android 14+) / force-quit (iOS: not expected to relaunch) | | | |
| 7 | After reboot (Android) | | n/a | |
| 8 | Events buffered in background are delivered when the app is reopened | | | |

### Push

| # | Check | Android | iOS | Evidence |
| --- | --- | --- | --- | --- |
| 9 | Push token reaches the backend after `configure()` | | | |
| 10 | Silent push with the app in background triggers scan and sync | | | |
| 11 | Silent push with the app closed triggers scan and sync | | | |
| 12 | Measurable push: receipt is reported | | | |
| 13 | Measurable push: tap is reported (app in background) | | | |
| 14 | Measurable push: tap is reported (tap launches the app) | | | |
| 15 | Rich push is drawn by the SDK | | needs extension targets | |
| 16 | A non-Bearound push still reaches the app's other push plugin | | | |

### Error conditions

| # | Check | Android | iOS | Evidence |
| --- | --- | --- | --- | --- |
| 17 | Location denied: permission methods resolve with the denied status | | | |
| 18 | Bluetooth permission denied: state is `unauthorized`, no crash | | | |
| 19 | Bluetooth turned off while scanning: state listener fires `poweredOff`, no crash | | | |
| 20 | Bluetooth turned back on: detection resumes | | | |
| 21 | Notifications denied: `requestNotificationPermission()` resolves `false` | | | |
| 22 | `startScanning()` before `configure()`: error event, no crash | | | |
| 23 | `configure()` with an empty token: rejects `INVALID_ARGUMENT` | | | |
